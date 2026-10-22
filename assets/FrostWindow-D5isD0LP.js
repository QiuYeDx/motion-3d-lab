import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{n as a,r as o}from"./index-gQ65n0JU.js";import{$ as s,E as c,Ht as l,Pt as u,Sn as d,Xt as f,Yt as p,bn as m,et as h,h as g,ht as _,it as v,jt as y,pt as b,u as x,vn as S,wt as C,xt as w,yn as T}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as E}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as D}from"./iso-CLB38p39.js";import{t as O}from"./Seg-CH5KfWEm.js";var k=e(t(),1),ee=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,A={amp:.045,f1:3.7,g1:1.3,f2:3.1,g2:1.9},j=`
vec2 warp(vec2 p, float A) {
  // fades out towards the frame so the lattice is never sampled outside the pane
  float d = min(min(p.x, A - p.x), min(p.y, 1.0 - p.y));
  float k = smoothstep(0.0, 0.12, d);
  return k * ${A.amp.toFixed(4)} * vec2(sin(p.y * ${A.f1.toFixed(3)} + p.x * ${A.g1.toFixed(3)} + 1.7), sin(p.x * ${A.f2.toFixed(3)} - p.y * ${A.g2.toFixed(3)} + 0.4));
}
`,M=`
float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec4 h42(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}
`,N=`
precision highp float;
varying vec2 vUv;
uniform float uA;
uniform float uTime;
uniform float uMobile;
${M}

const vec3 LAMP = vec3(1.0, 0.6, 0.26);

float box(vec2 p, vec2 c, vec2 h, float b) {
  vec2 d = abs(p - c) - h;
  float m = max(d.x, d.y);
  return smoothstep(b, -b, m);
}

// light reaching a point from the street lamps (used to light the snow)
float lampField(vec2 p, out vec3 cone) {
  float acc = 0.0;
  cone = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float x = -0.05 + fi * 0.62;
    vec2 head = vec2(x, 0.5 - fi * 0.0);
    vec2 d = p - head;
    acc += exp(-dot(d, d) * 20.0) * 0.9;
    // cone under the lamp
    float dy = head.y - p.y;
    if (dy > 0.0 && p.y > 0.11) {
      float w = dy * 0.5 + 0.012;
      float c = smoothstep(w, w * 0.15, abs(d.x)) * exp(-dy * 1.6);
      cone += LAMP * c;
    }
  }
  return acc;
}

float snow(vec2 p, float cs, float speed, float rad, float soft, float seed, float amt) {
  vec2 q = p;
  q.y += uTime * speed;
  q.x += sin(q.y * 2.3 + seed) * 0.02 + uTime * speed * 0.18;
  vec2 id = floor(q / cs);
  float acc = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cid = id + vec2(float(i), float(j));
      vec4 h = h42(cid + seed);
      if (h.x > amt) continue;
      vec2 c = (cid + 0.15 + 0.7 * h.yz) * cs;
      c.x += sin(uTime * (0.6 + h.w) + h.w * 30.0) * cs * 0.18;
      float r = rad * (0.55 + 0.7 * h.w);
      float d = length(q - c);
      acc += smoothstep(r, r * soft, d) * (0.55 + 0.45 * h.y);
    }
  }
  return acc;
}

void main() {
  vec2 p0 = vec2(vUv.x * uA, vUv.y);
  // compose the street for a 1.6-wide view and centre it; portrait screens look at the middle of it
  float x = p0.x + (1.6 - uA) * 0.5 + uMobile * 0.32; // phones: the lamp next to the warm window
  float y = p0.y + uMobile * 0.06;
  vec2 p = vec2(x, y);

  // night sky: deep blue, a little warm city glow behind the roofs
  vec3 col = mix(vec3(0.05, 0.075, 0.13), vec3(0.012, 0.02, 0.045), smoothstep(0.4, 1.0, y));
  col += vec3(0.2, 0.11, 0.06) * exp(-abs(y - 0.62) * 7.0) * 0.35;

  // across the street: a tall facade (left) and a lower one (right)
  float f1 = box(p, vec2(0.34, 0.9), vec2(0.62, 0.58), 0.006);
  float roof2 = 0.82 + 0.02 * step(1.3, x);
  float f2 = box(p, vec2(1.33, 0.5), vec2(0.36, roof2 - 0.5), 0.006);
  vec3 wall = vec3(0.028, 0.036, 0.058);
  col = mix(col, wall, max(f1, f2));
  // snow on the roof edge of the lower building
  col += vec3(0.16, 0.19, 0.25) * smoothstep(0.012, 0.0, abs(y - roof2 - 0.004)) * step(0.97, x) * step(x, 1.69) * 0.7;

  // windows
  {
    vec2 cs = vec2(0.15, 0.165);
    vec2 g = (p - vec2(0.0, 0.36)) / cs;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float inF1 = step(-0.28, x) * step(x, 0.92) * step(0.0, id.y);
    float inF2 = step(1.02, x) * step(x, 1.66) * step(0.0, id.y) * step(y, roof2 - 0.06);
    float inside = max(inF1, inF2);
    vec4 h = h42(id + 3.0);
    float w = box(f, vec2(0.0), vec2(0.24, 0.3), 0.06);
    float lit = step(0.68, h.x);
    // the one warm window everybody looks at
    bool hero = id.x == 7.0 && id.y == 1.0;
    vec3 wc = mix(vec3(1.0, 0.58, 0.26), vec3(1.0, 0.78, 0.5), h.y) * (0.35 + 0.5 * h.z);
    if (h.w > 0.85) wc = vec3(0.45, 0.62, 0.95) * 0.5; // a TV-blue one
    if (hero) {
      float cur = smoothstep(0.02, 0.08, abs(f.x)) ; // curtains drawn to the sides
      wc = vec3(1.0, 0.62, 0.3) * (1.35 - 0.5 * cur);
      lit = 1.0;
      w = box(f, vec2(0.0), vec2(0.3, 0.36), 0.05);
    }
    col = mix(col, col * 0.6 + wc * lit, w * inside);
    // snow on the sills
    col += vec3(0.13, 0.15, 0.2) * box(f, vec2(0.0, -0.34), vec2(0.28, 0.02), 0.03) * inside;
  }

  // ground: snow, faintly blue, with warm pools of lamplight
  float ground = smoothstep(0.322, 0.31, y);
  vec3 snowCol = mix(vec3(0.09, 0.11, 0.16), vec3(0.14, 0.16, 0.22), smoothstep(0.31, 0.0, y));
  col = mix(col, snowCol, ground);
  // curb line
  col *= 1.0 - 0.35 * smoothstep(0.008, 0.0, abs(y - 0.2)) * ground;

  vec3 cone;
  float lf = lampField(p, cone);
  for (int i = 0; i < 4; i++) {
    float lx = -0.05 + float(i) * 0.62;
    // pools on the snow
    vec2 dp = vec2((x - lx) * 0.9, (y - 0.2) * 3.2);
    col += LAMP * exp(-dot(dp, dp) * 30.0) * 0.4 * ground;
    // posts
    col = mix(col, vec3(0.02, 0.022, 0.03), smoothstep(0.004, 0.0015, abs(x - lx)) * step(0.12, y) * step(y, 0.5));
  }
  col += cone * 0.06;

  // lamp heads (soft defocused discs) and their halos
  for (int i = 0; i < 4; i++) {
    vec2 head = vec2(-0.05 + float(i) * 0.62, 0.5);
    float d = length(p - head);
    col += LAMP * (smoothstep(0.03, 0.022, d) * 2.2 + exp(-d * 9.0) * 0.32 + exp(-d * 30.0) * 0.6);
  }

  // falling snow: far, mid, near (near flakes are big and soft — out of focus)
  vec3 lit = vec3(0.32, 0.38, 0.5) + LAMP * lf * 2.2 + cone * 2.0;
  col += lit * snow(p, 0.03, 0.06, 0.0022, 0.2, 1.0, 0.55) * 0.35;
  col += lit * snow(p, 0.06, 0.1, 0.0045, 0.35, 7.0, 0.45) * 0.4;
  col += lit * snow(p + 3.0, 0.14, 0.17, 0.012, 0.05, 13.0, 0.35) * 0.22;

  gl_FragColor = vec4(col, 1.0);
}
`,P=`
uniform sampler2D tS;
uniform vec2 uSimRes;
vec4 at(vec2 cell) { return texture2D(tS, (cell + 0.5) / uSimRes); }
`,F=`
precision highp float;
varying vec2 vUv;
uniform vec2 uSimRes;
uniform float uSeed;
uniform float uCell; // CSS px per texel
uniform float uBeta;
uniform float uInterior; // share of 110-px cells that hold a dust speck
${M}

// one nucleus every ~spacing texels along an edge, on a jittered lattice
float edgeSeeds(float t, float depth, float spacing, float prob, float seed) {
  float id = floor(t / spacing);
  float best = 0.0;
  for (int k = -1; k <= 1; k++) {
    float cid = id + float(k);
    vec2 h = vec2(h12(vec2(cid, seed)), h12(vec2(seed, cid * 1.7)));
    if (h.x > prob) continue;
    float c = (cid + 0.2 + 0.6 * h.y) * spacing;
    float r = 0.9 + 1.4 * h.x;
    float d = length(vec2(t - c, depth - 0.5));
    best = max(best, step(d, r));
  }
  return best;
}

void main() {
  vec2 cell = floor(vUv * uSimRes);
  vec2 p = cell + 0.5;
  float k = 2.0 / uCell; // spacing is given in CSS px / 2
  float f = 0.0;
  f = max(f, edgeSeeds(p.x, p.y, 30.0 * k, 0.8, uSeed + 1.0));                  // bottom (coldest)
  f = max(f, edgeSeeds(p.x, uSimRes.y - p.y, 54.0 * k, 0.55, uSeed + 2.0));     // top
  f = max(f, edgeSeeds(p.y, p.x, 40.0 * k, 0.65, uSeed + 3.0));                 // left
  f = max(f, edgeSeeds(p.y, uSimRes.x - p.x, 40.0 * k, 0.65, uSeed + 4.0));     // right
  vec2 q = min(p, uSimRes - p);
  f = max(f, step(length(q * vec2(1.0, 0.866)), 4.0));                          // corners
  // a few dust specks inside the pane grow into lone stars
  vec2 gc = floor(p / (110.0 * k));
  vec4 gh = h42(gc + uSeed * 1.3);
  vec2 gp = (gc + 0.2 + 0.6 * gh.yz) * 110.0 * k;
  if (gh.x < uInterior) f = max(f, step(length((p - gp) * vec2(1.0, 0.866)), 1.2));
  // a little jitter in the vapour makes the arms branch irregularly from the first step
  float s = f > 0.5 ? 1.0 : uBeta * (0.97 + 0.06 * h12(p + uSeed));
  gl_FragColor = vec4(s, 0.0, 0.0, 0.0);
}
`,I=`
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
${P}
uniform float uBeta;   // ambient vapour
uniform float uGamma;  // water condensing on the ice per step
uniform float uRho;    // humidity: vapour drifting back to β
uniform float uWarmK;  // warmth kept per step
uniform float uRimeK;  // rime haze growth per step
${M}

float uOf(vec4 v) { return v.z > 0.5 ? 0.0 : v.x; }
float frz(vec4 v) { return step(1.0, v.x); }

void main() {
  vec2 cell = floor(vUv * uSimRes);
  float odd = mod(cell.y, 2.0);
  vec2 o = odd > 0.5 ? vec2(0.0, 1.0) : vec2(-1.0, 0.0);
  vec4 c = at(cell);
  vec4 n0 = at(cell + vec2(-1.0, 0.0));
  vec4 n1 = at(cell + vec2(1.0, 0.0));
  vec4 n2 = at(cell + vec2(o.x, 1.0));
  vec4 n3 = at(cell + vec2(o.y, 1.0));
  vec4 n4 = at(cell + vec2(o.x, -1.0));
  vec4 n5 = at(cell + vec2(o.y, -1.0));

  float warm = c.y;
  float nf = frz(n0) + frz(n1) + frz(n2) + frz(n3) + frz(n4) + frz(n5);
  float rec = (frz(c) + nf) > 0.5 && warm < 0.04 ? 1.0 : 0.0;

  float u = rec > 0.5 ? 0.0 : c.x;
  float avg = (uOf(n0) + uOf(n1) + uOf(n2) + uOf(n3) + uOf(n4) + uOf(n5)) / 6.0;
  float s = u + 0.5 * (avg - u);
  if (rec > 0.5) s += c.x + uGamma;
  else s += uRho * (uBeta - s);

  // warmth: spreads a little, fades; while warm nothing freezes, and real warmth melts the ice
  float wavg = (n0.y + n1.y + n2.y + n3.y + n4.y + n5.y) / 6.0;
  warm = max(0.0, (warm + 0.12 * (wavg - warm)) * uWarmK - 0.0004);
  if (warm > 0.04) s = min(s, 0.985);
  if (warm > 0.5) s = mix(s, uBeta, 0.2);

  // rime: a faint haze settles on bare cold glass over time
  float rime = c.w;
  rime = s < 1.0 && warm < 0.04 ? rime + (1.0 - rime) * uRimeK : rime;

  gl_FragColor = vec4(s, warm, rec, rime);
}
`,L=`
uniform vec4 uB0[16]; // x0 y0 x1 y1 (pane units)
uniform vec4 uB1[16]; // radius (pane units), type, strength, —
uniform int uN;
uniform float uA;
float capsule(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}
`,R=`
precision highp float;
varying vec2 vUv;
uniform sampler2D tS;
uniform float uBeta;
${L}
void main() {
  vec4 c = texture2D(tS, vUv);
  vec2 p = vec2(vUv.x * uA, vUv.y);
  for (int i = 0; i < 16; i++) {
    if (i >= uN) break;
    vec4 b0 = uB0[i];
    vec4 b1 = uB1[i];
    float d = capsule(p, b0.xy, b0.zw);
    float r = b1.x;
    float type = b1.y;
    if (type < 0.5) {
      // warm fingertip: melts the ice, wipes the rime, leaves the glass warm for a while
      float a = smoothstep(r, r * 0.6, d) * b1.z;
      float hard = step(d, r * 0.85);
      c.x = mix(c.x, uBeta * 0.8, max(a, hard));
      c.y = max(c.y, a);
      c.w = mix(c.w, 0.0, a);
      c.z = mix(c.z, 0.0, hard);
    } else if (type < 1.5) {
      // a running drop melts a narrow channel
      float a = smoothstep(r, r * 0.5, d) * b1.z;
      float hard = step(d, r * 0.8);
      c.x = mix(c.x, uBeta, hard);
      c.y = max(c.y, a * 0.7);
      c.w = mix(c.w, 0.0, a);
      c.z = mix(c.z, 0.0, hard);
    } else if (type < 2.5) {
      // breath: warm moist air pauses the growth (it doesn't melt the ice)
      float a = exp(-d * d / (r * r) * 2.5) * b1.z;
      c.y = max(c.y, min(0.45, c.y + a * 0.6));
    } else {
      // a new nucleus (dust speck on the glass)
      if (d < r && c.y < 0.04) c.x = max(c.x, 1.0);
    }
  }
  gl_FragColor = c;
}
`,z=`
precision highp float;
varying vec2 vUv;
uniform sampler2D tG;
uniform float uDt;
uniform float uMist; // mist the breath leaves behind fades with this rate
${L}
void main() {
  vec4 c = texture2D(tG, vUv);
  vec2 p = vec2(vUv.x * uA, vUv.y);
  c.x = max(0.0, c.x - uDt * 0.07);       // the wipe dries in ~15 s
  c.y = max(0.0, c.y - uDt * uMist * (0.4 + c.y)); // breath mist evaporates
  for (int i = 0; i < 16; i++) {
    if (i >= uN) break;
    vec4 b0 = uB0[i];
    vec4 b1 = uB1[i];
    float d = capsule(p, b0.xy, b0.zw);
    float r = b1.x;
    float type = b1.y;
    if (type < 0.5) {
      float a = smoothstep(r * 1.1, r * 0.5, d) * b1.z;
      c.x = max(c.x, a);
      c.y = mix(c.y, 0.0, a);
      vec2 dir = b0.zw - b0.xy;
      float l = length(dir);
      if (l > 1e-5) c.zw = mix(c.zw, dir / l, a);
    } else if (type < 1.5) {
      float a = smoothstep(r, r * 0.4, d) * b1.z;
      c.x = max(c.x, a * 0.85);
      c.zw = mix(c.zw, vec2(0.0, 1.0), a);
    } else if (type < 2.5) {
      float a = exp(-d * d / (r * r) * 1.3) * b1.z;
      c.y = min(1.2, c.y + a);
    }
  }
  gl_FragColor = c;
}
`,B=`
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D tStreet;
uniform sampler2D tS;
uniform sampler2D tG;
uniform vec2 uSimTx;
uniform vec2 uRes;    // drawing buffer px
uniform float uDpr;
uniform float uA;
uniform float uTime;
uniform float uFade;
uniform vec4 uDrops[24]; // x, y (pane), r (pane), alpha
uniform vec3 uGhost; // x, y (pane), alpha — the fingertip of the auto-wipe
${M}
${j}

vec3 street(vec2 uv, float lod) { return textureLod(tStreet, uv, lod).rgb; }

float iceOf(float s) { return smoothstep(0.965, 1.015, s); }
float thickOf(float s) { return 1.0 - exp(-max(s - 1.0, 0.0) * 1.3); }
float iceAt(vec2 uv) { return iceOf(texture2D(tS, uv).x); }
float heightAt(vec2 uv) {
  float s = texture2D(tS, uv).x;
  return iceOf(s) * 0.6 + sqrt(max(s - 1.0, 0.0)) * 0.9;
}

void main() {
  vec2 uv = vUv;
  vec2 px = gl_FragCoord.xy / uDpr; // CSS px
  vec2 pane = vec2(uv.x * uA, uv.y);
  vec2 wp = pane + warp(pane, uA);
  vec2 su = vec2(wp.x / uA, wp.y); // where this pixel sits on the frost lattice

  vec4 S = texture2D(tS, su);
  vec4 G = texture2D(tG, su);
  float ice = iceOf(S.x);
  float thick = thickOf(S.x);
  float wet = G.x;
  float mist = clamp(G.y, 0.0, 1.0);

  // relief of the ice → normal
  vec2 e = uSimTx;
  float hx = heightAt(su + vec2(e.x, 0.0)) - heightAt(su - vec2(e.x, 0.0));
  float hy = heightAt(su + vec2(0.0, e.y)) - heightAt(su - vec2(0.0, e.y));
  vec3 n = normalize(vec3(-hx * 2.2, -hy * 2.2, 1.0));
  float edge = clamp(length(vec2(iceAt(su + vec2(e.x, 0.0)) - iceAt(su - vec2(e.x, 0.0)), iceAt(su + vec2(0.0, e.y)) - iceAt(su - vec2(0.0, e.y)))) * 1.4, 0.0, 1.0);

  // how frosted this spot is: crystals, plus the thin rime haze that settles on bare cold glass
  float rime = clamp(S.w * (1.0 - ice) * 0.6, 0.0, 0.5);
  float frost = max(ice * (0.72 + 0.28 * thick), rime);

  // --- clear glass: the street, a little smeared where a finger went
  vec2 dir = G.zw;
  float dl = length(dir);
  vec2 dn = dl > 1e-3 ? dir / dl : vec2(1.0, 0.0);
  vec2 sp = vec2(dot(px, dn), dot(px, vec2(-dn.y, dn.x)));
  float streak = h12(vec2(floor(sp.y / 3.0), 7.0)) * 0.6 + h12(vec2(floor(sp.y / 11.0), 3.0)) * 0.4;
  float smear = wet * (0.4 + 0.6 * streak);
  vec2 refr = n.xy * 0.006 * (frost + wet * 0.5);
  vec3 clear = street(uv + refr, smear * 1.6);
  clear *= 1.0 + 0.08 * (streak - 0.5) * wet;

  // --- frosted: blurred + scattered (the lamps glow through the ice)
  vec3 blur = vec3(0.0);
  float br = 10.0 / uRes.y * uDpr;
  blur += street(uv + refr * 3.0 + vec2(br, 0.0), 3.6);
  blur += street(uv + refr * 3.0 - vec2(br, 0.0), 3.6);
  blur += street(uv + refr * 3.0 + vec2(0.0, br), 3.6);
  blur += street(uv + refr * 3.0 - vec2(0.0, br), 3.6);
  blur *= 0.25;
  vec3 glow = street(uv, 6.0);
  float lumB = dot(glow, vec3(0.3, 0.55, 0.15));
  vec3 iceCol = blur * 0.8 + glow * 0.9 + vec3(0.30, 0.40, 0.55) * 0.07;
  // crystal relief: room-side light from the upper left, a cold sky reflection on the slopes
  vec3 L = normalize(vec3(-0.5, 0.6, 0.62));
  float ndl = dot(n, L);
  iceCol *= 0.85 + 0.45 * ndl;
  iceCol += vec3(0.62, 0.75, 0.95) * (0.05 + 0.16 * thick) * ice;
  iceCol += vec3(0.75, 0.85, 1.0) * pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 24.0) * 0.18 * ice;
  // crisp crystal edges catch light
  iceCol += (vec3(0.7, 0.82, 1.0) * 0.16 + glow * 0.8) * edge;

  vec3 col = mix(clear, iceCol, frost);

  // --- sparkle: individual facets glint and twinkle, more where light comes through
  {
    vec2 cell = floor(px / 3.0);
    vec4 h = h42(cell + 11.0);
    if (h.x > 0.955 && ice > 0.5) {
      vec2 f = (fract(px / 3.0) - 0.5) * 3.0 - (h.yz - 0.5) * 1.5;
      float tw = pow(max(0.0, sin(uTime * (0.6 + h.w * 2.2) + h.y * 60.0)), 18.0);
      float star = exp(-dot(f, f) * 1.2) + exp(-abs(f.x) * 3.0 - abs(f.y) * 0.7) * 0.25 + exp(-abs(f.y) * 3.0 - abs(f.x) * 0.7) * 0.25;
      col += vec3(0.85, 0.93, 1.0) * star * tw * (0.35 + lumB * 6.0) * ice;
    }
  }

  // --- wet edge: a thin lens of melt water along the boundary of a wipe catches the light
  {
    vec2 ge = 2.5 * uDpr / uRes;
    float wx = texture2D(tG, su + vec2(ge.x, 0.0)).x - texture2D(tG, su - vec2(ge.x, 0.0)).x;
    float wy = texture2D(tG, su + vec2(0.0, ge.y)).x - texture2D(tG, su - vec2(0.0, ge.y)).x;
    float rim = smoothstep(0.04, 0.3, length(vec2(wx, wy))) * smoothstep(0.05, 0.4, wet);
    vec2 bend = normalize(vec2(wx, wy) + 1e-5) * 0.012;
    col += (street(uv - bend, 1.5) * 0.9 + glow * 0.6 + vec3(0.5, 0.58, 0.7) * 0.07) * rim * 0.8;
    // the wiped glass itself: a faint watery sheen in the direction of the stroke
    col += vec3(0.5, 0.56, 0.66) * 0.035 * wet * streak * (1.0 - frost);
  }

  // --- breath mist: a soft milky veil of condensation with a fine dew grain
  {
    float grain = h12(floor(px / 2.0) + 5.0);
    vec3 mistCol = blur * 1.2 + glow * 2.0 + vec3(0.45, 0.52, 0.64) * 0.3;
    mistCol *= 0.9 + 0.2 * grain;
    float mk = smoothstep(0.0, 1.0, mist);
    col = mix(col, max(col, mistCol), mk * 0.9);
  }

  // --- drops of melt water: tiny ball lenses showing the street upside down
  for (int i = 0; i < 24; i++) {
    vec4 d = uDrops[i];
    if (d.w <= 0.0) continue;
    vec2 q = pane - d.xy;
    q.y *= 1.12;
    float r = d.z;
    float dd = dot(q, q) / (r * r);
    if (dd > 1.6) continue;
    // contact shadow / meniscus ring just outside
    col *= 1.0 - 0.25 * d.w * smoothstep(1.6, 1.0, dd) * step(1.0, dd);
    if (dd < 1.0) {
      float z = sqrt(1.0 - dd);
      vec3 dn3 = normalize(vec3(q / r, z * 1.3));
      vec2 look = uv - q / vec2(uA, 1.0) * 5.5; // inverted, zoomed-out view through the drop
      vec3 dc = street(look, 0.5) * 1.3 + vec3(0.04, 0.05, 0.07);
      dc *= 0.5 + 0.5 * smoothstep(0.0, 0.7, z);      // dark rim
      // light from behind gathers in a bright crescent at the bottom, a room-side highlight sits up top
      dc += (glow * 2.2 + vec3(0.25, 0.3, 0.38) * 0.35) * smoothstep(0.25, 0.95, -q.y / r) * (1.0 - z * 0.5);
      float sp = pow(max(dot(dn3, normalize(vec3(-0.35, 0.55, 0.75))), 0.0), 24.0);
      dc += vec3(1.0, 0.96, 0.9) * sp * 1.1;
      col = mix(col, dc, d.w * smoothstep(1.0, 0.86, dd));
    }
  }

  // --- the ghost fingertip of the auto-wipe: a faint warm touch
  {
    vec2 q = pane - uGhost.xy;
    col += vec3(1.0, 0.7, 0.45) * exp(-dot(q, q) / 0.0012) * 0.12 * uGhost.z;
  }

  // vignette + slight cold grade
  vec2 v = uv - 0.5;
  col *= 1.0 - 0.32 * dot(v, v) * 1.6;
  col = col / (1.0 + col * 0.12);

  gl_FragColor = vec4(col * uFade + vec3(0.03, 0.045, 0.07) * (1.0 - uFade), 1.0);
}
`,V=n(),H=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,U=16,W=[{zh:`−2°`,beta:.36,gamma:3e-4,rho:2e-5,sps:26,nuc:.03,warm:4.5},{zh:`−10°`,beta:.42,gamma:5e-4,rho:4e-5,sps:62,nuc:.12,warm:3.2},{zh:`−20°`,beta:.5,gamma:8e-4,rho:8e-5,sps:95,nuc:.4,warm:2.2}],G=(e,t,n)=>{let r=Math.min(e,n-e,t,1-t),i=Math.min(1,Math.max(0,r/.12));return i*i*(3-2*i)},K=(e,t,n)=>e+G(e,t,n)*A.amp*Math.sin(t*A.f1+e*A.g1+1.7),te=(e,t,n)=>t+G(e,t,n)*A.amp*Math.sin(e*A.f2-t*A.g2+.4),q=.0062,J=class{list=[];add(e,t,n){for(let r of this.list)if(Math.hypot(r.x-e,r.y-t)<r.r+n){r.r=Math.min(.016,Math.hypot(r.r,n));return}this.list.length>=24||this.list.push({x:e,y:t,r:n,vy:0,stick:.3+Math.random()*.6,a:0,moving:!1,lx:e,ly:t,seed:Math.random()*100,age:0})}step(e,t){let n=this.list;for(let r of n)if(r.age+=e,r.a=Math.min(1,r.a+e*4),!r.moving&&r.r>q&&r.stick<=0&&(r.moving=!0),r.stick-=e,r.moving){let n=.025+.16*Math.min(1,(r.r-q*.8)/.008);r.stick>0?n=0:Math.random()<e*1.4&&(r.stick=.08+Math.random()*.5),r.vy+=(n-r.vy)*Math.min(1,e*6),r.y-=r.vy*e,r.x+=Math.sin(r.y*50+r.seed)*r.vy*e*.25,r.r-=r.vy*e*.012,Math.hypot(r.x-r.lx,r.y-r.ly)>r.r*.6&&(t.push({x0:r.lx,y0:r.ly,x1:r.x,y1:r.y,r:r.r*1.15,type:1,s:1}),r.lx=r.x,r.ly=r.y),r.r<q*.75&&(r.moving=!1)}else r.age>4&&(r.a-=e*.12);for(let e=0;e<n.length;e++)for(let t=e+1;t<n.length;t++){let r=n[e],i=n[t];if(!(r.a<=0||i.a<=0)&&Math.hypot(r.x-i.x,r.y-i.y)<(r.r+i.r)*.85){let e=r.r>=i.r?r:i,t=e===r?i:r;e.r=Math.min(.016,Math.hypot(e.r,t.r)),e.vy=Math.max(e.vy,t.vy),e.stick=Math.min(e.stick,0),t.a=0}}this.list=n.filter(e=>e.a>0&&e.y>-.03)}},Y=[Array.from({length:48},(e,t)=>{let n=t/47*Math.PI*2,r=16*Math.sin(n)**3,i=13*Math.cos(n)-5*Math.cos(2*n)-2*Math.cos(3*n)-Math.cos(4*n);return[r/34,(i+2.5)/34]})],ne=[Array.from({length:40},(e,t)=>{let n=t/39*Math.PI*2+Math.PI/2;return[Math.cos(n)*.48,Math.sin(n)*.48]}),[[-.17,.14],[-.16,.06]],[[.17,.14],[.16,.06]],Array.from({length:14},(e,t)=>{let n=Math.PI*(1.15+t/13*.7);return[Math.cos(n)*.28,Math.sin(n)*.28+.02]})],re=[[[.3,.95],[.12,.6]],[[.22,.72],[.22,.04]],[[.52,.95],[.42,.74]],[[.46,.8],[.92,.8],[.86,.66]],[[.68,.7],[.68,.06],[.58,.13]],[[.53,.52],[.42,.3]],[[.82,.52],[.93,.3]]],ie=[[[.3,.96],[.16,.5],[.44,.3]],[[.4,.78],[.33,.4],[.08,.1]],[[.04,.62],[.48,.64]],[[.56,.88],[.9,.88],[.72,.72]],[[.72,.72],[.72,.06],[.63,.13]],[[.5,.5],[.97,.5]]],ae=[...re.map(e=>e.map(([e,t])=>[e*.5-.53,t*.5-.25])),...ie.map(e=>e.map(([e,t])=>[e*.5+.03,t*.5-.25]))],X=[{path:Y,size:.42,r:.026},{path:ae,size:.62,r:.019},{path:ne,size:.36,r:.024}];function oe(e,t,n,r,i){let a=[],o=0;for(let s of e){let e=t+s[0][0]*r,c=n+s[0][1]*r;o+=.18,a.push({x:e,y:c,t:o,down:!1});for(let l=1;l<s.length;l++){let u=t+s[l][0]*r,d=n+s[l][1]*r;o+=Math.hypot(u-e,d-c)/i,a.push({x:u,y:d,t:o,down:!0}),e=u,c=d}}return a}function Z(e,t,n,r,i=!1){return new d(Math.max(2,e),Math.max(2,t),{type:n,format:l,minFilter:i?_:r,magFilter:r,generateMipmaps:i,depthBuffer:!1,stencilBuffer:!1})}function se({tempRef:e,beta:t,brushes:n,cmd:r,lastTouch:i,onReady:a}){let o=g(e=>e.gl),l=g(e=>e.size),d=(0,k.useMemo)(()=>{let e=new c;e.setAttribute(`position`,new s([-1,-1,0,3,-1,0,-1,3,0],3)),e.setAttribute(`uv`,new s([0,0,2,0,0,2],2));let t=(e,t)=>new f({vertexShader:ee,fragmentShader:e,uniforms:t,depthTest:!1,depthWrite:!1,toneMapped:!1}),n=()=>({uB0:{value:Array.from({length:U},()=>new m)},uB1:{value:Array.from({length:U},()=>new m)},uN:{value:0},uA:{value:1}}),r=t(N,{uA:{value:1},uTime:{value:0},uMobile:{value:+!!H}}),i=t(F,{uSimRes:{value:new S},uSeed:{value:0},uCell:{value:2},uBeta:{value:.4},uInterior:{value:D?.3:.11}}),a=t(I,{tS:{value:null},uSimRes:{value:new S},uBeta:{value:.4},uGamma:{value:6e-4},uRho:{value:.001},uWarmK:{value:.99},uRimeK:{value:1e-4}}),l=t(R,{tS:{value:null},uBeta:{value:.4},...n()}),d=t(z,{tG:{value:null},uDt:{value:0},uMist:{value:.25},...n()}),g=t(B,{tStreet:{value:null},tS:{value:null},tG:{value:null},uSimTx:{value:new S},uRes:{value:new S},uDpr:{value:1},uA:{value:1},uTime:{value:0},uFade:{value:0},uDrops:{value:Array.from({length:24},()=>new m)},uGhost:{value:new T}}),_=new C(e,g);_.frustumCulled=!1;let x=new p;x.add(_);let w=new u(-1,1,1,-1,0,1),E=o.extensions.has(`EXT_color_buffer_float`);return{geo:e,street:r,init:i,step:a,brush:l,glass:d,comp:g,quad:_,scene:x,cam:w,simType:E?h:v,simFilter:!E||o.extensions.has(`OES_texture_float_linear`)?b:y,mats:[r,i,a,l,d,g]}},[o]),_=(0,k.useRef)(null),E=(0,k.useMemo)(()=>new J,[]),O=(0,k.useRef)({ready:!1,t:0,fade:0,inited:!1,boost:0,acc:0,lastClear:0,lastBreath:0,breathT:-1,breathX:0,breathY:0,nucAcc:0,ghost:null,ghostIdx:0,ghostNext:0,ghostA:0,posterPhase:0});(0,k.useEffect)(()=>($.current=E,()=>{$.current=null}),[E]),(0,k.useEffect)(()=>{let e=!1,t=new p;for(let e of d.mats){let n=new C(d.geo,e);n.frustumCulled=!1,t.add(n)}let n=o.getRenderTarget();return o.setRenderTarget(null),o.compileAsync(t,d.cam).catch(()=>{}).then(()=>{e||(O.current.ready=!0,a())}),o.setRenderTarget(n),()=>{e=!0}},[o,d]),(0,k.useEffect)(()=>()=>{let e=_.current;e&&[e.street,...e.s,...e.g].forEach(e=>e.dispose()),d.mats.forEach(e=>e.dispose()),d.geo.dispose()},[d]);let A=(0,k.useRef)([]);return x((a,s)=>{let c=Math.min(s,1/30),u=O.current,f=o.getRenderTarget();if(!u.ready){o.setRenderTarget(null),o.setClearColor(`#0b111b`,1),o.clear(!0,!1,!1);return}u.t+=c;let p=l.width,m=l.height,h=p/m,g=W[e.current],y=_.current,x=Math.max(H?1.6:2,Math.max(p,m)/960),S=Math.round(p/x),C=Math.round(m/(x*.866));(!y||y.w!==S||y.h!==C)&&(y&&[y.street,...y.s,...y.g].forEach(e=>e.dispose()),y=_.current={w:S,h:C,cell:x,street:Z(Math.round(p*.5),Math.round(m*.5),v,b,!0),s:[Z(S,C,d.simType,d.simFilter),Z(S,C,d.simType,d.simFilter)],g:[Z(Math.round(S/2),Math.round(C/2),v,b),Z(Math.round(S/2),Math.round(C/2),v,b)]},u.inited=!1);let T=y,k=()=>T.s=[T.s[1],T.s[0]],ee=()=>T.g=[T.g[1],T.g[0]],j=(e,t)=>{d.quad.material=e,o.setRenderTarget(t),o.render(d.scene,d.cam)},M=r.current;if(!u.inited||M.clear!==u.lastClear){u.boost=u.inited&&M.clear!==u.lastClear?0:D?50:45,u.inited=!0,u.lastClear=M.clear,d.init.uniforms.uSimRes.value.set(S,C),d.init.uniforms.uSeed.value=Math.random()*50,d.init.uniforms.uCell.value=x,d.init.uniforms.uBeta.value=t.get(),j(d.init,y.s[0]),o.setClearColor(0,0);for(let e of y.g)o.setRenderTarget(e),o.clear(!0,!1,!1);E.list.length=0,u.ghost=null,u.ghostNext=u.t+(D?0:14)}let N=A.current;if(N.push(...n.current),n.current.length=0,M.breath!==u.lastBreath&&(u.lastBreath=M.breath,u.breathT=0,u.breathX=h*(H||h<1?.5:.64)+(Math.random()-.5)*.08,u.breathY=(H||h<1?.6:.55)+(Math.random()-.5)*.06),u.breathT>=0){u.breathT+=c;let e=Math.min(1,u.breathT/.9),t=(H||h<1?.16:.22)*(.45+.55*Math.sqrt(e));N.push({x0:u.breathX,y0:u.breathY,x1:u.breathX,y1:u.breathY,r:t,type:2,s:c*3.2*(1-e*.6)}),e>=1&&(u.breathT=-1)}let P=performance.now()-i.current>6500;if(!u.ghost&&u.boost<=0&&(D?u.posterPhase===0:P&&u.t>u.ghostNext)){let e=X[u.ghostIdx%X.length];u.ghostIdx++;let t=H||h<1,n=e.size*(t?Math.min(1,h*.9/(e.size*1.25)):1),r=D?h*.5:h*(t?.5:.66),i=D?.52:t?.6:.56;u.ghost={pts:oe(e.path,r,i,n,.55),t:0,i:0,r:e.r*(t?.85:1),lx:0,ly:0}}if(u.ghost){let e=u.ghost;for(e.t+=D?1e3:c;e.i<e.pts.length&&e.pts[e.i].t<=e.t;){let t=e.pts[e.i];t.down&&Q(N,E,e.lx,e.ly,t.x,t.y,e.r),e.lx=t.x,e.ly=t.y,e.i++}let t=e.lx,n=e.ly;if(e.i<e.pts.length&&e.pts[e.i].down){let r=e.pts[e.i-1],i=e.pts[e.i],a=(e.t-r.t)/Math.max(1e-4,i.t-r.t);t=r.x+(i.x-r.x)*a,n=r.y+(i.y-r.y)*a,Q(N,E,e.lx,e.ly,t,n,e.r),e.lx=t,e.ly=n}u.ghostA=Math.min(1,u.ghostA+c*3),d.comp.uniforms.uGhost.value.set(t,n,u.ghostA*(e.i<e.pts.length&&e.pts[e.i].down?1:.4)),e.i>=e.pts.length&&(u.ghost=null,D&&(u.posterPhase=1),u.ghostNext=u.t+22),!P&&!D&&(u.ghost=null)}else u.ghostA=Math.max(0,u.ghostA-c*2),d.comp.uniforms.uGhost.value.z=u.ghostA*.4;for(u.nucAcc+=c*g.nuc;u.nucAcc>=1;){--u.nucAcc;let e=Math.random()*h,t=.08+Math.random()*.84;N.push({x0:e,y0:t,x1:e,y1:t,r:.0045,type:3,s:1})}if(u.posterPhase===1){u.posterPhase=2;for(let e=0;e<75;e++)E.step(1/30,N)}else E.step(c,N);d.street.uniforms.uA.value=h,d.street.uniforms.uTime.value=u.t,j(d.street,y.street);let F=d.brush.uniforms,I=d.glass.uniforms;F.uA.value=I.uA.value=h,I.uMist.value=.13;let L=!0,R=0;do{let e=Math.min(U,N.length-R);for(let t=0;t<e;t++){let e=N[R+t];F.uB0.value[t].set(K(e.x0,e.y0,h),te(e.x0,e.y0,h),K(e.x1,e.y1,h),te(e.x1,e.y1,h)),F.uB1.value[t].set(e.r,e.type,e.s,0),I.uB0.value[t].copy(F.uB0.value[t]),I.uB1.value[t].set(e.r,e.type,e.s,0)}F.uN.value=I.uN.value=e,e>0&&(F.tS.value=y.s[0].texture,j(d.brush,y.s[1]),k()),I.tG.value=y.g[0].texture,I.uDt.value=L?c:0,j(d.glass,y.g[1]),ee(),L=!1,R+=e}while(R<N.length);N.length=0;let z=d.step.uniforms,B=t.get(),V=(B-W[0].beta)/(W[2].beta-W[0].beta);z.uSimRes.value.set(S,C),z.uBeta.value=B,d.brush.uniforms.uBeta.value=B,z.uGamma.value=w.lerp(W[0].gamma,W[2].gamma,V),z.uRho.value=w.lerp(W[0].rho,W[2].rho,V);let G=g.sps;z.uWarmK.value=.04**(1/(g.warm*G)),z.uRimeK.value=1-.4**(1/(25*G)),u.acc+=g.sps*c;let q=Math.floor(u.acc);u.acc-=q,u.boost>0&&(q=D?100:40,u.boost--);for(let e=0;e<q;e++)z.tS.value=y.s[0].texture,j(d.step,y.s[1]),k();u.fade=Math.min(1,u.fade+c/1.1);let J=d.comp.uniforms;J.tStreet.value=y.street.texture,J.tS.value=y.s[0].texture,J.tG.value=y.g[0].texture,J.uSimTx.value.set(1/S,1/C),o.getDrawingBufferSize(J.uRes.value),J.uDpr.value=o.getPixelRatio(),J.uA.value=h,J.uTime.value=u.t,J.uFade.value=u.fade*u.fade*(3-2*u.fade);let Y=J.uDrops.value;for(let e=0;e<24;e++){let t=E.list[e];t?Y[e].set(t.x,t.y,t.r,Math.min(1,t.a)):Y[e].set(0,0,0,0)}j(d.comp,f)},1),null}function Q(e,t,n,r,i,a,o){e.push({x0:n,y0:r,x1:i,y1:a,r:o,type:0,s:1});let s=Math.hypot(i-n,a-r),c=Math.floor(s/.012+Math.random());for(let e=0;e<c;e++){if(Math.random()>.3)continue;let e=Math.random();t.add(n+(i-n)*e+(Math.random()-.5)*o,r+(a-r)*e-o*(.55+Math.random()*.3),.003+Math.random()*.004)}}function ce(){let[e,t]=(0,k.useState)(1),[n,s]=(0,k.useState)(!1),c=(0,k.useRef)(e);c.current=e;let l=i(W[1].beta),u=(0,k.useRef)([]),d=(0,k.useRef)({clear:0,breath:0}),f=(0,k.useRef)(performance.now()-4e3),p=(0,k.useRef)(null);(0,k.useEffect)(()=>{let t=r(l,W[e].beta,{duration:1.6,ease:[.45,0,.2,1]});return()=>t.stop()},[e,l]),(0,k.useEffect)(()=>{let e=p.current,t=-1,n=0,r=0,i=t=>{let n=e.getBoundingClientRect();return[(t.clientX-n.left)/n.height,1-(t.clientY-n.top)/n.height]},a=()=>H?.034:.04,o=o=>{if(o.button!==0)return;t=o.pointerId,f.current=performance.now();let[s,c]=i(o);n=s,r=c,u.current.push({x0:s,y0:c,x1:s+1e-4,y1:c,r:a(),type:0,s:1}),e.setPointerCapture?.(o.pointerId)},s=e=>{if(e.pointerId!==t)return;f.current=performance.now();let[o,s]=i(e),c=[],l=$.current;l?Q(c,l,n,r,o,s,a()):c.push({x0:n,y0:r,x1:o,y1:s,r:a(),type:0,s:1}),u.current.push(...c),n=o,r=s},c=e=>{e.pointerId===t&&(t=-1)};return e.addEventListener(`pointerdown`,o),e.addEventListener(`pointermove`,s),e.addEventListener(`pointerup`,c),e.addEventListener(`pointercancel`,c),()=>{e.removeEventListener(`pointerdown`,o),e.removeEventListener(`pointermove`,s),e.removeEventListener(`pointerup`,c),e.removeEventListener(`pointercancel`,c)}},[]);let m=W[e];return(0,V.jsxs)(`div`,{className:`stage fw-root`,style:{background:`#0b111b`},children:[(0,V.jsx)(`style`,{children:le}),(0,V.jsx)(`div`,{ref:p,className:`fw-canvas`,children:(0,V.jsx)(E,{linear:!0,flat:!0,dpr:[1,1.75],gl:{antialias:!1,alpha:!1,powerPreference:`high-performance`},children:(0,V.jsx)(se,{tempRef:c,beta:l,brushes:u,cmd:d,lastTouch:f,onReady:()=>s(!0)})})}),(0,V.jsxs)(`div`,{className:`overlay`,children:[(0,V.jsxs)(a.div,{className:`fw-copy soft-text`,initial:{opacity:0,y:12,filter:`blur(6px)`},animate:n?{opacity:1,y:0,filter:`blur(0px)`}:{},transition:{duration:.9,delay:.4,ease:[.23,1,.32,1]},children:[(0,V.jsx)(`div`,{className:`scrim fw-scrim`}),(0,V.jsxs)(`p`,{className:`fw-kicker`,children:[(0,V.jsx)(`i`,{}),(0,V.jsx)(`span`,{children:`FROST ·`}),(0,V.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,V.jsxs)(a.span,{initial:{opacity:0,y:8},animate:{opacity:1,y:0},exit:{opacity:0,y:-8},transition:{duration:.4,ease:[.23,1,.32,1]},children:[m.zh,`C`]},m.zh)})]}),(0,V.jsx)(`h1`,{children:`一夜冰花`}),(0,V.jsx)(`p`,{className:`fw-sub`,children:`冰晶从窗框上的晶核出发，沿六个方向分叉生长。用指尖擦开一道，街灯就透进来；停手，它又慢慢冻回去。`})]}),(0,V.jsxs)(`div`,{className:`dock`,children:[(0,V.jsx)(O,{items:W.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:t}),(0,V.jsx)(`span`,{className:`dock-sep`}),(0,V.jsx)(`button`,{className:`seg`,onClick:()=>{d.current.breath++,f.current=performance.now()},children:(0,V.jsx)(`span`,{children:`哈一口气`})}),(0,V.jsx)(`button`,{className:`seg`,onClick:()=>{d.current.clear++,f.current=performance.now()-3e3},children:(0,V.jsx)(`span`,{children:`清空`})})]}),(0,V.jsx)(`p`,{className:`hint`,children:`按住拖动 · 用指尖融开冰花`})]})]})}var $={current:null},le=`
.fw-canvas { position: absolute; inset: 0; touch-action: none; cursor: grab; }
.fw-canvas:active { cursor: grabbing; }
.fw-canvas canvas { display: block; }
.fw-copy {
  --soft-bg: #04070d;
  position: absolute; left: clamp(24px, 6vw, 96px); bottom: 104px;
  max-width: 400px; pointer-events: none !important;
}
.fw-copy { isolation: isolate; }
.fw-scrim { --soft-bg: rgba(4, 7, 13, 0.82); left: -160px; right: -200px; height: 420px; }
.fw-kicker {
  display: flex; align-items: center; gap: 8px; margin: 0 0 14px;
  font: 500 12px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2);
}
.fw-kicker i { width: 6px; height: 6px; border-radius: 50%; background: #9fd0ff; box-shadow: 0 0 10px #9fd0ff; }
.fw-kicker span { display: inline-block; }
.fw-copy h1 { margin: 0; font: 600 clamp(32px, 3.6vw, 50px)/1.06 var(--display); letter-spacing: -.03em; }
.fw-sub { margin: 12px 0 0; font-size: 14px; line-height: 1.75; color: var(--fg-2); }
@media (max-width: 760px) {
  .fw-copy { bottom: 92px; right: 24px; }
  .fw-copy h1 { font-size: 30px; }
  .fw-sub { font-size: 13px; }
}
`;export{ce as default};