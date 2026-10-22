import{B as e,Ct as t,Ht as n,bn as r,hn as i,jt as a,yn as o}from"./events-9ce18a08.esm-BJiOHOtz.js";var s=[{id:`jingtai`,label:`景泰蓝`,en:`Cloisonné`},{id:`painted`,label:`画珐琅`,en:`Painted enamel`},{id:`silver`,label:`银胎`,en:`Silver wire`}],c={title:`景泰蓝`,en:`Cloisonné`,background:`#1b2a3a`,theme:`dark`},l={jingtai:[`#c8242c`,`#e0782a`,`#f4c42e`,`#9cc23a`,`#36994c`,`#1b7a5c`,`#2db2c4`,`#1f8ed2`,`#1f3f9e`,`#5b3d9c`,`#a8327a`,`#e65f7c`,`#f4efe1`,`#1c1a22`,`#2a9ccb`,`#e8423a`],painted:[`#d2453f`,`#e8955a`,`#f0cf5a`,`#a8c870`,`#5fae74`,`#3f8f7a`,`#6cc0cc`,`#4f8fd0`,`#3a5cb0`,`#7c64b8`,`#c060a0`,`#ec8fa0`,`#fbf7ee`,`#3a3438`,`#fbf8f0`,`#d8b04a`],silver:[`#b0283e`,`#c0704a`,`#e2d38a`,`#8fc0a8`,`#3f9f8f`,`#1d5f68`,`#2a62b8`,`#17327e`,`#101d5a`,`#4a3a9a`,`#7a3a8a`,`#c78fb8`,`#e8eef6`,`#0b0f1c`,`#121c50`,`#9fd0f0`]},u={jingtai:{A:[1,1.2,1,0],B:[1,.74,.32,1]},painted:{A:[0,1.5,2,1],B:[1,.77,.36,1.15]},silver:{A:[1,1.05,1,0],B:[.86,.89,.95,1]}},d=[`jingtai`,`painted`,`silver`],f={jingtai:0,painted:1,silver:2},p=e=>{let t=parseInt(e.slice(1),16);return[t>>16&255,t>>8&255,t&255]},m=`
#define PI 3.14159265
#define TAU 6.28318531
uniform sampler2D tPal;    // 16×3 RGBA8, row = mode
uniform int uDirs;         // taps per ring (as a uniform: keeps the loops rolled on ANGLE/FXC)
uniform vec4 uTA; uniform vec4 uTB;
uniform vec4 uFA; uniform vec4 uFB;
uniform float uFrom;
uniform float uTo;
uniform float uMix;
uniform float uCell;       // scroll cell, CSS px (screen mode)
uniform float uGround;     // 1: the background becomes a turquoise plaque
uniform float uAnchor;     // 1: scroll laid on a turning object's surface
uniform mat4 uAnchorM;     // view → object space
uniform vec4 uAnchorP;     // tan(fov/2), cells round the axis, cell height (object units), -
uniform mat4 uAnchorM2;    // a second turning object (used where the point lies inside its bounds)
uniform vec4 uAnchorP2;    // -, cells round, cell height, on
uniform vec4 uAnchorB2;    // bounds in its object space: max radius, y min, y max, -
uniform vec3 uLight;       // glaze light direction (view space)
uniform float uBand;       // flat-ground glaze band position (wipe coordinate)

vec4 PA; vec4 PB;
float ROW;

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

// enamel family by hue (lighting shifts the shade, not the family): 0–11 hues, 12 white, 13 black
float enamelOf(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float ch = mx - mn;
  if (mx < 0.11) return 13.0;
  if (ch < 0.16 * mx + 0.02) return mx < 0.3 ? 13.0 : 12.0;
  float h;
  if (mx == c.r) h = mod((c.g - c.b) / ch, 6.0);
  else if (mx == c.g) h = (c.b - c.r) / ch + 2.0;
  else h = (c.r - c.g) / ch + 4.0;
  return mod(floor(h * 2.0 + 0.5), 12.0);
}

// label of a sample for wire purposes: enamel family, 14 = plaque ground, -1 = not enamel (passes through)
float labelAt(vec4 s, float cov) {
  if (cov < 0.5) return uGround > 0.5 ? 14.0 : -1.0;
  if (s.a < 0.97) return -1.0;   // pass-through (and its antialiased rim)
  return enamelOf(toS(s.rgb));
}

// 缠枝 scroll in cell units: a wavy stem, two spirals per cell (under the crest, over the trough), each with a
// tendril up / down to the stem and a small flower at its eye. Returns distance (cells); eye = flower mask
vec2 spiral(vec2 q, float s, float up) {
  // archimedean, r = b·θ for θ in [th0, th1]; its outer end points to the stem (up = ±1)
  float b = 0.024;
  float th0 = 3.7;
  float th1 = 8.4;
  float phi0 = up * PI * 0.5 - s * th1;
  float rho = length(q);
  float t = mod(s * (atan(q.y, q.x) - phi0), TAU);
  float k = floor((rho / b - t) / TAU + 0.5);
  float th = t + TAU * max(k, 0.0);
  float d = abs(rho - b * th);
  if (th > th1) {
    vec2 e = b * th1 * vec2(cos(phi0 + s * th1), sin(phi0 + s * th1));
    d = length(q - e);
  }
  if (th < th0) {
    vec2 e = b * th0 * vec2(cos(phi0 + s * th0), sin(phi0 + s * th0));
    d = min(length(q - e), abs(rho - b * th));
  }
  float eye = rho - 0.055;
  return vec2(min(d, abs(eye)), eye);
}

float sdVesica(vec2 p, float r, float d) {
  p = abs(p);
  float b = sqrt(r * r - d * d);
  return (p.y - b) * d > p.x * b ? length(p - vec2(0.0, b)) : length(p - vec2(-d, 0.0)) - r;
}

// x: distance to the nearest wire (cells), y: flower eye (< 0 inside), z: leaf (< 0 inside), w: per-cell random
vec4 scroll(vec2 P) {
  // rows are 0.72 cells apart (the motif spans y .14–.86 of its cell, so neighbours just touch)
  float row = floor(P.y / 0.72);
  float odd = mod(row, 2.0);
  P.x += odd * 0.5;
  vec2 id = vec2(floor(P.x), row);
  vec2 f = vec2(P.x - id.x, 0.14 + fract(P.y / 0.72) * 0.72);
  if (odd > 0.5) f.x = 1.0 - f.x;   // alternate rows curl the other way
  float A = 0.15;
  float ys = 0.5 + A * sin(TAU * f.x);
  float sl = A * TAU * cos(TAU * f.x);
  float d = abs(f.y - ys) / sqrt(1.0 + sl * sl);
  // spiral under the crest (x = .25), spiral over the trough (x = .75), tendrils to the stem
  vec2 s1 = spiral(f - vec2(0.25, 0.42), 1.0, 1.0);
  vec2 s2 = spiral(f - vec2(0.75, 0.58), -1.0, -1.0);
  float t1 = max(abs(f.x - 0.25), max(0.58 - f.y, f.y - (0.5 + A)));
  float t2 = max(abs(f.x - 0.75), max(f.y - 0.42, (0.5 - A) - f.y));
  d = min(d, min(min(s1.x, s2.x), min(t1, t2)));
  // a leaf sprouting from the stem where it falls through the middle
  vec2 q = f - vec2(0.47, 0.72);
  q = vec2(0.78 * q.x - 0.62 * q.y, 0.62 * q.x + 0.78 * q.y);
  float leaf = sdVesica(q, 0.182, 0.137);
  d = min(d, abs(leaf));
  float eye = min(s1.y, s2.y);
  float which = s1.y < s2.y ? 0.0 : 1.0;
  return vec4(d, eye, leaf, hash12(id * 2.0 + which + row * 7.0));
}

vec3 stylize(vec2 px) {
  // which mode this pixel shows: a polishing band sweeps across on a change
  bool to = true;
  float front = 9.0;
  if (uMix < 1.0) {
    float f = wipeCoord(px) + (vnoise(px / uDpr * 0.01) - 0.5) * 0.03 - (uMix * 1.24 - 0.12);
    to = f <= 0.0;
    front = abs(f);
  }
  PA = to ? uTA : uFA;
  PB = to ? uTB : uFB;
  ROW = to ? uTo : uFrom;

  vec2 uv = px / uRes;
  vec4 s0 = sceneT(px);
  vec4 n0 = nrmT(px);
  vec3 c0 = toS(s0.rgb);
  float d0 = depthL(px);
  float lab = labelAt(s0, n0.a);
  bool enamel = lab > -0.5;
  vec3 nv = n0.a > 0.5 ? normalize(n0.rgb * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);

  // 1 · border wire: nearest change of enamel / coverage / depth / crease, three radii
  float hw = PA.y * uDpr;
  float dB = hw * 2.0;
  vec3 avg = c0;
  float na = 1.0;
  for (int i = 0; i < 3; i++) {
    float r = hw * (float(i) + 1.0) / 3.0;
    for (int k = 0; k < uDirs; k++) {
      float a = (float(k) + 0.5 * float(i)) * TAU / float(uDirs);
      vec2 q = px + vec2(cos(a), sin(a)) * r;
      vec4 sk = sceneT(q);
      vec4 nk = nrmT(q);
      float lk = labelAt(sk, nk.a);
      bool diff = false;
      if (enamel && lk > -0.5) {
        diff = PA.x > 0.5 && abs(lk - lab) > 0.5;
        diff = diff || abs(nk.a - n0.a) > 0.5;
        if (n0.a > 0.5 && nk.a > 0.5) {
          diff = diff || abs(depthL(q) - d0) > max(d0 * 0.04, 0.03);
          vec3 nkv = nk.rgb * 2.0 - 1.0;
          // sharp creases (not the fast normal turn near a curved silhouette)
          diff = diff || (dot(nkv, nv) < 0.55 && min(nkv.z, nv.z) > 0.3);
        }
      }
      if (diff) dB = min(dB, r - hw / 6.0);
      if (abs(nk.a - n0.a) < 0.5) { avg += toS(sk.rgb); na += 1.0; }
    }
  }
  avg /= na;

  // 2 · scroll wire coordinates: on the turning object, or on the screen
  vec2 P = px / uDpr / uCell;
  float wrapN = 1e6;   // P.x is periodic with this many cells (anchored: wraps round the axis)
  if (uAnchor > 0.5 && n0.a > 0.5) {
    vec2 ndc = uv * 2.0 - 1.0;
    vec3 vp = vec3(ndc.x * d0 * uAnchorP.x * uRes.x / uRes.y, ndc.y * d0 * uAnchorP.x, -d0);
    vec3 o = (uAnchorM * vec4(vp, 1.0)).xyz;
    vec2 cr = uAnchorP.yz;
    vec3 o2 = (uAnchorM2 * vec4(vp, 1.0)).xyz;
    if (uAnchorP2.w > 0.5 && length(o2.xz) < uAnchorB2.x && o2.y > uAnchorB2.y && o2.y < uAnchorB2.z) {
      o = o2;
      cr = uAnchorP2.yz;
    }
    P = vec2(atan(o.x, o.z) / TAU * cr.x, o.y / cr.y);
    wrapN = cr.x;
  }
  // cells per device px (the jump where the angle wraps round the back is taken out)
  vec2 dPx = dFdx(P), dPy = dFdy(P);
  dPx.x -= wrapN * floor(dPx.x / wrapN + 0.5);
  dPy.x -= wrapN * floor(dPy.x / wrapN + 0.5);
  float gpx = 0.5 * (length(dPx) + length(dPy));
  gpx = clamp(gpx, 1.0 / (uCell * uDpr * 6.0), 1.0 / (6.0 * uDpr));
  vec4 S = scroll(P);
  float dS = S.x / gpx;                 // device px to the scroll wire
  float hwS = hw * 0.8;
  float eyeIn = S.y < 0.0 ? 1.0 : 0.0;
  float scrollK = 0.0;
  if (enamel && PA.z > 0.5 && (dS < hwS * 2.5 + 1.0 || S.y < 0.0 || S.z < 0.0)) {
    // erosion probe: keep the scroll inside big cells only
    float E = 7.0 * uDpr;
    float inside = 1.0;
    for (int k = 0; k < uDirs; k++) {
      float a = float(k) * TAU / float(uDirs) + 0.3;
      vec2 q = px + vec2(cos(a), sin(a)) * E;
      vec4 nk = nrmT(q);
      float lk = labelAt(sceneT(q), nk.a);
      inside = min(inside, abs(lk - lab) < 0.5 && abs(nk.a - n0.a) < 0.5 ? 1.0 : 0.0);
    }
    scrollK = inside;
  }
  float dW = min(dB, mix(1e3, dS, scrollK * (PA.z > 0.5 && PA.z < 1.5 ? 1.0 : 0.0)));
  float onS = step(dW, dB - 1e-3);
  float wHalf = mix(hw, hwS, onS);

  // 3 · enamel
  int row = int(ROW);
  vec3 en = texelFetch(tPal, ivec2(int(max(lab, 0.0)), row), 0).rgb;
  float wireS = PA.z > 0.5 && PA.z < 1.5 ? 1.0 : 0.0;   // 2 = painted scroll (no metal)
  float flower = eyeIn * scrollK * wireS;
  if (scrollK * wireS > 0.5 && S.z < 0.0) en = texelFetch(tPal, ivec2(abs(lab - 4.0) < 0.5 ? 3 : 4, row), 0).rgb;
  if (flower > 0.5) {
    float pick = S.w;
    en = pick < 0.4 ? texelFetch(tPal, ivec2(15, row), 0).rgb : (pick < 0.75 ? texelFetch(tPal, ivec2(2, row), 0).rgb : texelFetch(tPal, ivec2(12, row), 0).rgb);
  }
  float v = max(c0.r, max(c0.g, c0.b));
  float shade = n0.a > 0.5 ? mix(0.74, 1.05, smoothstep(0.08, 0.85, v)) : 1.0;
  // painted enamel: the scene's own (softened) colour, laid over white enamel
  if (PA.w > 0.5) {
    vec3 paint = mix(vec3(luma(avg)), avg, 1.35);
    float cover = clamp(0.25 + 1.4 * (max(paint.r, max(paint.g, paint.b)) - min(paint.r, min(paint.g, paint.b))), 0.0, 1.0);
    vec3 white = texelFetch(tPal, ivec2(14, row), 0).rgb;
    // the paint thins out toward the light, so the white enamel glows through (brushy along one direction)
    float brush = vnoise(vec2(px.x * 0.6 + px.y * 0.35, px.y * 0.08 - px.x * 0.1) / uDpr * 0.12);
    cover *= 1.0 - 0.55 * smoothstep(0.55, 1.0, v) + 0.07 * (brush - 0.5);
    en = n0.a > 0.5 ? mix(white, clamp(paint * 1.08, 0.0, 1.0), clamp(cover, 0.0, 1.0) * 0.92) : white;
    shade = n0.a > 0.5 ? mix(0.84, 1.03, smoothstep(0.1, 0.8, v)) : 1.0;
    // painted scroll on the white ground: soft blue lines, coral buds
    if (PA.z > 1.5 && scrollK > 0.5 && (lab > 11.5 && lab < 12.5 || lab > 13.5)) {
      float ln = 1.0 - smoothstep(hwS * 0.45, hwS * 0.45 + 1.2 * uDpr, dS);
      en = mix(en, texelFetch(tPal, ivec2(7, row), 0).rgb, ln * 0.75);
      if (S.y < 0.0) en = mix(en, texelFetch(tPal, ivec2(0, row), 0).rgb, 0.8);
      if (S.z < 0.0) en = mix(en, texelFetch(tPal, ivec2(4, row), 0).rgb, 0.55);
    }
  }
  vec2 tp = P * 9.0;
  en *= shade * (1.0 + (1.0 - 0.7 * PA.w) * (0.07 * (vnoise(P * 3.3 + lab) - 0.5) + 0.03 * (vnoise(px / uDpr * 0.35) - 0.5)));
  // pooling: enamel sinks and darkens along the wire
  float pool = exp(-max(dW - wHalf, 0.0) / (3.0 * uDpr)) * (1.0 - PA.w * 0.7);
  en = mix(en, en * en * 1.05, 0.55 * pool);
  // pits and bubbles
  vec2 bi = floor(tp);
  float bh = hash12(bi + 0.37 * lab);
  if (bh < 0.09) {
    vec2 bc = 0.25 + 0.5 * vec2(hash12(bi + 1.3), hash12(bi + 2.9));
    float br = 0.06 + 0.06 * hash12(bi + 5.1);
    float bd = length(fract(tp) - bc) / br;
    float pit = 1.0 - smoothstep(0.7, 1.0, bd);
    en = mix(en, en * (bh < 0.045 ? 0.62 : 1.18), pit * 0.7);
  }

  // glaze: polished specular streak (normal-based on objects, a travelling band on flat ground)
  vec3 H = normalize(uLight + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(nv, H), 0.0);
  float spec = n0.a > 0.5 ? pow(nh, 110.0) * 0.9 + pow(nh, 14.0) * 0.05 : 0.0;
  float band = exp(-pow((wipeCoord(px) - uBand) / 0.035, 2.0)) * 0.22 + exp(-pow((wipeCoord(px) - uBand - 0.07) / 0.012, 2.0)) * 0.12;
  if (n0.a < 0.5) spec = band;
  float env = 0.05 * smoothstep(-0.3, 1.0, nv.y) * (n0.a > 0.5 ? 1.0 : 0.0);
  vec3 col = en + (spec + env) * PB.w * vec3(1.0, 0.98, 0.94);

  // 4 · wire: rounded profile, gold flanks → bright crest, glints in the light sweep
  float r = clamp(dW / wHalf, 0.0, 1.0);
  float h = sqrt(max(1.0 - r * r, 0.0));
  vec3 wc = PB.rgb;
  vec3 wire = wc * (0.32 + 0.78 * h);
  wire += mix(wc, vec3(1.0), 0.6) * pow(h, 7.0) * (0.35 + 1.6 * spec / max(PB.w, 0.1) + 0.5 * band);
  float edge = 1.0 - smoothstep(wHalf - 0.6, wHalf + 0.6, dW);
  if (enamel) col = mix(col, wire, edge);
  // painted enamel: a thin gold rim on silhouettes only
  if (!enamel) {
    // passes through: the page's own backdrop / stand, gilt mounts catch the glints
    col = c0;
    if (n0.a > 0.5 && s0.a < 0.4) col += vec3(1.0, 0.85, 0.5) * spec * 0.8;
  }

  // the polishing band of a mode change
  if (uMix < 1.0 && enamel) col += vec3(1.0, 0.92, 0.75) * exp(-front * front / 0.0004) * 0.55;
  return clamp(col, 0.0, 1.0);
}
`,h=new WeakMap,g=e=>e.uniforms?h.get(e.uniforms):void 0;function _(s={}){let g=s.mode??`jingtai`,_=s.cell??76,v=new Uint8Array(192);d.forEach((e,t)=>l[e].forEach((e,n)=>v.set([...p(e),255],(t*16+n)*4)));let y=new e(v,16,3,n,i);y.minFilter=y.magFilter=a,y.needsUpdate=!0;let b={tPal:{value:y},uDirs:{value:8},uTA:{value:new r},uTB:{value:new r},uFA:{value:new r},uFB:{value:new r},uFrom:{value:f[g]},uTo:{value:f[g]},uMix:{value:1},uCell:{value:_},uGround:{value:1},uAnchor:{value:0},uAnchorM:{value:new t},uAnchorP:{value:new r(.3,14,.4,0)},uAnchorM2:{value:new t},uAnchorP2:{value:new r(0,10,.3,0)},uAnchorB2:{value:new r(1,0,1,0)},uLight:{value:new o(-.4,.5,.8).normalize()},uBand:{value:0}},x={mode:g,t:0,cell:_,cellT:_,sweep:!0};h.set(b,x);let S=(e,t)=>{let n=u[d[t]];b[e+`A`].value.fromArray(n.A),b[e+`B`].value.fromArray(n.B)},C=()=>{S(`uT`,b.uTo.value),S(`uF`,b.uFrom.value)};return C(),{frag:m,uniforms:b,normals:!0,background:c.background,update(e){let t=b;x.t+=e,t.uMix.value<1&&(t.uMix.value=Math.min(1,t.uMix.value+e/1.4),t.uMix.value>=1&&(t.uFrom.value=t.uTo.value)),C(),x.cell+=(x.cellT-x.cell)*(1-Math.exp(-e*5)),Math.abs(x.cell-x.cellT)<.01&&(x.cell=x.cellT),t.uCell.value=x.cell;let n=x.t,r=x.sweep?Math.sin(n*.32)*.75:-.35;t.uLight.value.set(Math.sin(r),.42+.12*Math.sin(n*.21),Math.cos(r)).normalize(),t.uBand.value=n/9%1*1.6-.3}}}function v(e,t){let n=g(e),r=e.uniforms;n&&n.mode!==t&&(n.mode=t,r.uMix.value>=.5&&(r.uFrom.value=r.uTo.value),r.uTo.value=f[t],r.uMix.value=0)}function y(e,t){let n=g(e);n&&(n.cellT=t)}function b(e,t){e.uniforms.uGround.value=+!!t}function x(e,t,n){let r=e.uniforms;if(r.uAnchor.value=+!!t,!t)return;r.uAnchorM.value.copy(t.viewToObject),r.uAnchorP.value.set(t.tanHalfFov,t.around,t.height,0);let i=r.uAnchorP2.value;i.w=+!!n,n&&(r.uAnchorM2.value.copy(n.viewToObject),i.set(0,n.around,n.height,1),r.uAnchorB2.value.set(n.radius,n.yMin,n.yMax,0))}export{x as a,v as c,_ as i,c as n,y as o,s as r,b as s,l as t};