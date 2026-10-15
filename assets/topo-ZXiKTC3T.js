import{O as e,dt as t,pt as n,vn as r,z as i}from"./events-9ce18a08.esm-BkDjjFw8.js";var a=[{id:`terrain`,label:`地形图`,en:`Terrain`},{id:`line`,label:`线稿`,en:`Line`},{id:`glow`,label:`夜光`,en:`Glow`,dark:!0}],o={title:`等高线地图`,en:`Topographic`,background:`#efeadb`,theme:`light`},s=[`#8fbf7f`,`#acd08f`,`#cfdc9f`,`#e9e1a9`,`#e2c98f`,`#cfa977`,`#b48a63`,`#9f7f68`,`#b8aca2`,`#f4f1ec`],c={terrain:{A:[.85,1.7,14,.4],B:[0,1,1,1]},line:{A:[.7,1.45,13,.22],B:[1,0,0,.6]},glow:{A:[.9,1.6,14,.18],B:[2,0,.5,0]}},l=`
uniform sampler2D tGlyph;  // digits 0-9, 64×64 cells in a row (white on transparent)
uniform sampler2D tRamp;   // hypsometric tints
uniform int uG;            // auto-range sample grid
uniform vec4 uDatum;       // view-space plane (normal, w) of elevation 0
uniform float uDatumOn;
uniform vec4 uRay;         // view ray: x/-z = ndc.x·x + y, y/-z = ndc.y·z + w
uniform float uMPU;        // metres per world unit (datum mode)
uniform float uLogScale;   // metres per halving of the view distance (default mode)
uniform float uRelief;     // metres at the top of the tint ramp (datum mode)
uniform float uInterval;   // contour interval, metres
uniform float uGrid;       // graticule spacing, CSS px
uniform float uCell;       // label cell, CSS px
uniform int uLC;           // label candidates per cell
// incoming (T) / outgoing (F) mode: A minor width, index width, glyph box (CSS px), graticule alpha
//                                    B style (0 terrain · 1 line · 2 glow), tints, hillshade, paper grain
uniform vec4 uTA; uniform vec4 uTB; uniform vec4 uFA; uniform vec4 uFB;
uniform float uMix;

vec4 PA; vec4 PB;

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 hash22(vec2 p) { return vec2(hash12(p), hash12(p + vec2(37.1, 11.7))); }

float depthL(vec2 px) {
  float d = textureLod(tDepth, px / uRes, 0.0).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
float covAt(vec2 px) { return textureLod(tNormal, px / uRes, 0.0).a; }
float elevAt(vec2 px) {
  float z = depthL(px);
  if (uDatumOn > 0.5) {
    vec2 ndc = px / uRes * 2.0 - 1.0;
    vec3 P = vec3((ndc.x * uRay.x + uRay.y) * z, (ndc.y * uRay.z + uRay.w) * z, -z);
    return (dot(uDatum.xyz, P) + uDatum.w) * uMPU;
  }
  return log2(uFar / max(z, 1e-4)) * uLogScale;
}

// label of this screen cell → x glyph coverage, y knock-out of the lines under it
vec2 label(vec2 px, float I5) {
  float cell = uCell * uDpr;
  vec2 cid = floor(px / cell);
  vec2 cc = (cid + 0.5) * cell;
  if (hash12(cid + 9.1) < 0.3) return vec2(0.0);   // leave some cells empty: labels stay sparse
  float gh = PA.z * uDpr;
  float adv = gh * 0.6;
  for (int c = 0; c < uLC; c++) {
    vec2 a = cc + (hash22(cid + 3.7 + float(c) * 17.0) - 0.5) * 0.5 * cell;
    if (covAt(a) < 0.5) continue;
    float Ea = elevAt(a);
    float st = 3.0 * uDpr;
    vec2 g = vec2(elevAt(a + vec2(st, 0.0)) - Ea, elevAt(a + vec2(0.0, st)) - Ea) / st;
    float gl = length(g);
    float spacing = I5 * 0.2 / max(gl, 1e-6);   // px between intermediate contours here
    if (gl < 1e-6 || spacing < gh * 0.6 || spacing > cell) continue;
    float Lv = floor(Ea / I5 + 0.5) * I5;
    if (Lv < I5 * 0.5) continue;
    vec2 a1 = a + (Lv - Ea) * g / (gl * gl);
    float nd = Lv < 9.5 ? 1.0 : Lv < 99.5 ? 2.0 : Lv < 999.5 ? 3.0 : Lv < 9999.5 ? 4.0 : 5.0;
    float halfL = nd * adv * 0.5;
    // the whole label stays inside its own cell (so a pixel only ever looks at one cell)
    vec2 off = abs(a1 - cc);
    if (max(off.x, off.y) > cell * 0.5 - halfL - 6.0 * uDpr) continue;
    vec2 tn = normalize(vec2(g.y, -g.x));
    if (tn.x < 0.0) tn = -tn;
    // the contour has to run along the whole label (not across a cliff or off the land)
    vec2 e1 = a1 - tn * (halfL + 2.0 * uDpr), e2 = a1 + tn * (halfL + 2.0 * uDpr);
    if (abs(elevAt(e1) - Lv) > I5 * 0.12 || abs(elevAt(e2) - Lv) > I5 * 0.12 || covAt(e1) < 0.5 || covAt(e2) < 0.5) continue;
    vec2 q = px - a1;
    float lx = dot(q, tn), ly = dot(q, vec2(-tn.y, tn.x));
    float knock = (1.0 - smoothstep(halfL + 2.0 * uDpr, halfL + 4.0 * uDpr, abs(lx)))
                * (1.0 - smoothstep(gh * 0.36, gh * 0.36 + 2.5 * uDpr, abs(ly)));
    float glyph = 0.0;
    if (abs(lx) < halfL && abs(ly) < gh * 0.5) {
      float u = (lx + halfL) / adv;
      float gi = floor(u);
      float digit = mod(floor(Lv / pow(10.0, nd - 1.0 - gi) + 0.01), 10.0);
      vec2 uv = vec2((digit * 64.0 + 32.0 + (u - gi - 0.5) * 0.6 * 64.0) / 640.0, 0.5 + ly / gh);
      glyph = textureLod(tGlyph, uv, max(log2(64.0 / gh), 0.0)).r;
    }
    return vec2(glyph, knock);
  }
  return vec2(0.0);
}

vec3 stylize(vec2 px) {
  bool to = true;
  if (uMix < 1.0) {
    float wc = wipeCoord(px);
    to = wc < uMix * 1.1 - 0.05;
  }
  PA = to ? uTA : uFA;
  PB = to ? uTB : uFB;
  float style = PB.x;
  vec2 cp = px / uDpr;

  /* elevation, its gradient (one-sided: the smaller slope, so cliffs don't smear) and the cliffs */
  float I = max(uInterval, 1e-3);
  float cov = covAt(px);
  float E = elevAt(px);
  float El = elevAt(px - vec2(1.0, 0.0)), Er = elevAt(px + vec2(1.0, 0.0));
  float Ed = elevAt(px - vec2(0.0, 1.0)), Eu = elevAt(px + vec2(0.0, 1.0));
  float gx1 = E - El, gx2 = Er - E, gy1 = E - Ed, gy2 = Eu - E;
  vec2 gE = vec2(abs(gx1) < abs(gx2) ? gx1 : gx2, abs(gy1) < abs(gy2) ? gy1 : gy2);
  float jump = max(max(abs(gx1), abs(gx2)), max(abs(gy1), abs(gy2)));
  float gl = max(length(gE), 1e-6);
  float cliff = cov * smoothstep(2.5, 6.0, jump / I) * step(gl * 6.0, jump);

  /* auto range of the scene (for the tints when there is no datum) */
  float Emin = 1e9, Emax = -1e9;
  for (int j = 0; j < uG; j++)
    for (int i = 0; i < uG; i++) {
      vec2 q = (vec2(float(i), float(j)) + 0.5) / float(uG) * uRes;
      if (covAt(q) > 0.5) { float e = elevAt(q); Emin = min(Emin, e); Emax = max(Emax, e); }
    }
  float h = uDatumOn > 0.5 ? E / uRelief : (E - Emin) / max(Emax - Emin, I * 4.0);
  h = clamp(h, 0.0, 1.0);

  /* contour distances (px) */
  float f = E / I;
  float dMinor = abs(f - floor(f + 0.5)) * I / gl;
  float f5 = E / (5.0 * I);
  float dIndex = abs(f5 - floor(f5 + 0.5)) * 5.0 * I / gl;
  float spacing = I / gl;                     // px between neighbouring contours
  float wMinor = PA.x * uDpr * 0.5, wIndex = PA.y * uDpr * 0.5;
  float lineMinor = (1.0 - smoothstep(wMinor - 0.55, wMinor + 0.55, dMinor)) * smoothstep(1.8, 4.5, spacing / (PA.x * uDpr));
  float lineIndex = (1.0 - smoothstep(wIndex - 0.6, wIndex + 0.6, dIndex)) * smoothstep(0.6, 2.2, spacing / (PA.x * uDpr));
  lineMinor *= cov * (1.0 - cliff);
  lineIndex *= cov * (1.0 - cliff);
  vec2 lab = cov > 0.5 ? label(px, 5.0 * I) : vec2(0.0);
  lineMinor *= 1.0 - lab.y;
  lineIndex *= 1.0 - lab.y;

  /* coastline + shallow water */
  float coast = 0.0, near = 0.0;
  for (int k = 0; k < 8; k++) {
    float an = float(k) * 0.785398 + 0.39;
    vec2 u = vec2(cos(an), sin(an));
    coast = max(coast, abs(covAt(px + u * 1.3 * uDpr) - cov));
    near += covAt(px + u * 9.0 * uDpr) + covAt(px + u * 22.0 * uDpr) * 0.6;
  }
  near = clamp(near / 12.8, 0.0, 1.0);

  /* hillshade from the view-space normal, lit from the upper left */
  vec4 nt = textureLod(tNormal, px / uRes, 0.0);
  vec3 nV = normalize(nt.rgb * 2.0 - 1.0);
  float hs = dot(nV, normalize(vec3(-0.6, 0.62, 0.5)));

  /* graticule (CSS px from the screen centre) */
  vec2 gp = (cp - uRes / uDpr * 0.5) / uGrid;
  vec2 gd = abs(fract(gp + 0.5) - 0.5) * uGrid;     // CSS px to the nearest meridian / parallel
  float grid = 1.0 - smoothstep(0.35, 0.35 + 1.0 / uDpr, min(gd.x, gd.y));
  float crossK = (1.0 - smoothstep(0.6, 0.6 + 1.0 / uDpr, min(gd.x, gd.y))) * step(max(gd.x, gd.y), 7.0);

  /* paper */
  float grain = vnoise(cp * 0.9) * 0.5 + vnoise(cp * 0.23) * 0.35 + vnoise(cp * 0.05) * 0.15;
  float fibre = vnoise(vec2(cp.x * 0.08, cp.y * 1.4)) * vnoise(vec2(cp.x * 1.1, cp.y * 0.07));
  vec2 vu = px / uRes - 0.5;
  float vig = 1.0 - dot(vu, vu) * 0.35;

  vec3 col;
  if (style < 0.5) {
    // 地形图 — USGS-like: tints × hillshade on cream paper, brown contours, blue coast
    vec3 paper = vec3(0.957, 0.937, 0.886) * (1.0 - PB.w * (0.05 * grain + 0.04 * fibre)) * vig;
    vec3 tint = textureLod(tRamp, vec2(h * 0.94 + 0.03, 0.5), 0.0).rgb;
    float shade = mix(1.0, clamp(0.62 + 0.62 * hs, 0.45, 1.18), PB.z);
    vec3 land = paper * mix(vec3(1.0), tint, PB.y) * shade;
    vec3 sea = mix(vec3(0.66, 0.8, 0.86), vec3(0.79, 0.89, 0.91), near) * (1.0 - 0.04 * grain);
    sea *= 1.0 - 0.035 * smoothstep(0.55, 0.9, vnoise(vec2(cp.x * 0.015, cp.y * 0.45)));  // faint water ripples
    col = mix(sea, land, cov);
    vec3 brown = vec3(0.58, 0.36, 0.19);
    col = mix(col, brown, lineMinor * 0.62);
    col = mix(col, brown * 0.82, lineIndex * 0.95);
    col = mix(col, vec3(0.38, 0.24, 0.13), cliff * 0.85);
    col = mix(col, vec3(0.2, 0.43, 0.62), coast * 0.9);
    col = mix(col, vec3(0.2, 0.36, 0.5), max(grid * PA.w * 0.6, crossK * PA.w * 1.6));
    col = mix(col, brown * 0.78, lab.x);
  } else if (style < 1.5) {
    // 线稿 — only the lines, black on white
    vec3 paper = vec3(0.975, 0.97, 0.958) * (1.0 - PB.w * (0.035 * grain + 0.03 * fibre));
    col = paper;
    float waterLine = (1.0 - cov) * ((1.0 - smoothstep(0.004, 0.025, abs(near - 0.42))) * 0.45 + (1.0 - smoothstep(0.003, 0.018, abs(near - 0.16))) * 0.25);
    vec3 ink = vec3(0.1, 0.1, 0.11);
    col = mix(col, ink, lineMinor * 0.5);
    col = mix(col, ink, lineIndex * 0.92);
    col = mix(col, ink, cliff * 0.8);
    col = mix(col, ink, max(coast, waterLine));
    col = mix(col, ink, max(grid * PA.w * 0.5, crossK * PA.w * 2.2));
    col = mix(col, ink, lab.x);
  } else {
    // 夜光 — a sci-fi terrain scan: cyan lines glowing on near-black, a sweep refreshing them
    vec3 bg = vec3(0.016, 0.035, 0.055) * (1.0 + 0.3 * (1.0 - length(vu) * 1.4));
    vec3 land = vec3(0.03, 0.085, 0.11) * (0.75 + 0.5 * clamp(hs, 0.0, 1.0) * PB.z);
    col = mix(bg, land, cov);
    float wc = wipeCoord(px);
    float ph = fract(uTime * 0.09 - wc * 0.85);
    float sweep = exp(-ph * 4.0);
    vec3 cyan = vec3(0.22, 0.9, 1.0);
    float glowM = exp(-dMinor / (2.2 * uDpr)) * cov * (1.0 - lab.y) * smoothstep(1.8, 4.5, spacing / (PA.x * uDpr));
    float glowI = exp(-dIndex / (4.0 * uDpr)) * cov * (1.0 - lab.y) * smoothstep(0.6, 2.2, spacing / (PA.x * uDpr));
    float k = 0.55 + 0.9 * sweep;
    col += cyan * (lineMinor * 0.55 + glowM * 0.12) * k;
    col += cyan * (lineIndex * 1.0 + glowI * 0.3) * k;
    col += cyan * cliff * 0.6 * k;
    col += vec3(0.5, 0.95, 1.0) * coast * 0.9;
    col += cyan * ((1.0 - cov) * near * 0.06);
    col += cyan * max(grid * PA.w * 0.35, crossK * PA.w * 1.2);
    // the sweep front itself
    col += cyan * (exp(-ph * 260.0) * 0.12 + smoothstep(0.99, 1.0, ph) * 0.12);
    col = mix(col, vec3(0.75, 0.98, 1.0), lab.x);
    col = 1.0 - exp(-col * 1.25);
  }
  return col;
}
`;function u(){let r=document.createElement(`canvas`);r.width=640,r.height=64;let i=r.getContext(`2d`);i.fillStyle=`#000`,i.fillRect(0,0,640,64),i.fillStyle=`#fff`,i.textAlign=`center`,i.textBaseline=`middle`,i.font=`600 50px "Helvetica Neue", "Segoe UI", Arial, sans-serif`;for(let e=0;e<10;e++)i.fillText(String(e),e*64+32,34);let a=new e(r);return a.minFilter=n,a.magFilter=t,a.generateMipmaps=!0,a}function d(){let e=s.length,n=new Uint8Array(e*4);s.forEach((e,t)=>{let r=parseInt(e.slice(1),16);n.set([r>>16&255,r>>8&255,r&255,255],t*4)});let r=new i(n,e,1);return r.minFilter=r.magFilter=t,r.needsUpdate=!0,r}var f=new WeakMap,p=e=>e.uniforms?f.get(e.uniforms):void 0;function m(e={}){let t=e.mode??`terrain`,n=e.interval??10,i=e=>new r().fromArray(e),a={tGlyph:{value:u()},tRamp:{value:d()},uG:{value:5},uDatum:{value:new r(0,1,0,0)},uDatumOn:{value:0},uRay:{value:new r(1,0,1,0)},uMPU:{value:1},uLogScale:{value:300},uRelief:{value:1e3},uInterval:{value:n},uGrid:{value:120},uCell:{value:150},uLC:{value:3},uTA:{value:i(c[t].A)},uTB:{value:i(c[t].B)},uFA:{value:i(c[t].A)},uFB:{value:i(c[t].B)},uMix:{value:1}},s={mode:t,interval:n,intervalT:n};return f.set(a,s),{frag:l,uniforms:a,normals:!0,background:o.background,update(e){let t=a;t.uMix.value<1&&(t.uMix.value=Math.min(1,t.uMix.value+e/1.1));let n=Math.log(s.interval),r=Math.log(s.intervalT);s.interval=Math.exp(n+(r-n)*(1-Math.exp(-e*4))),Math.abs(s.interval-s.intervalT)<.001*s.intervalT&&(s.interval=s.intervalT),t.uInterval.value=s.interval}}}function h(e,t){let n=p(e),r=e.uniforms;n&&n.mode!==t&&(n.mode=t,r.uMix.value>=.5&&(r.uFA.value.copy(r.uTA.value),r.uFB.value.copy(r.uTB.value)),r.uTA.value.fromArray(c[t].A),r.uTB.value.fromArray(c[t].B),r.uMix.value=0)}function g(e,t){let n=p(e);n&&(n.intervalT=t)}function _(e,t){let n=e.uniforms;n.uGrid.value=t}function v(e,t){let n=e.uniforms;if(!t){n.uDatumOn.value=0;return}let r=t.proj.elements;n.uDatumOn.value=1,n.uDatum.value.copy(t.plane),n.uRay.value.set(1/r[0],r[8]/r[0],1/r[5],r[9]/r[5]),n.uMPU.value=t.metresPerUnit,n.uRelief.value=t.relief}export{g as a,a as c,_ as i,m as n,h as o,v as r,o as s,s as t};