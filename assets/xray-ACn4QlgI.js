import{N as e,_n as t,mt as n,vn as r}from"./events-9ce18a08.esm-BkDjjFw8.js";var i=[{id:`film`,label:`胶片`},{id:`ct`,label:`CT 伪彩`},{id:`scan`,label:`安检机`}],a={title:`X 光`,en:`X-Ray`,background:`#05080c`,theme:`dark`};function o(t,r=0,i=new e){let a=(1.15+1.6*t)/Math.max(.05,1-r);return i.setRGB(a,a,a,n)}var s=`
uniform vec3 uW;        // film, ct, scan
uniform float uDose;
uniform vec4 uLens;     // centre (device px), radius (device px), amount
uniform float uScan;    // CT slice centre, 0..1 from the top
uniform float uT;
uniform float uSeed;

vec3 linL(vec2 p) { return textureLod(tScene, p / uRes, 0.0).rgb * uExposure; }
vec4 nrmL(vec2 p) { return textureLod(tNormal, p / uRes, 0.0); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

// x = view-facing-ness, y = dense, z = coverage; n = view normal
vec3 matAt(vec2 p, out vec3 nn) {
  vec4 n = nrmL(p);
  vec3 c = linL(p);
  nn = normalize(n.rgb * 2.0 - 1.0);
  float f = clamp(nn.z, 0.0, 1.0);
  float L = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float chroma = (L - mn) / max(L, 1e-3);
  float dense = clamp((L - 1.15) / 1.6, 0.0, 1.6) * (1.0 - smoothstep(0.18, 0.45, chroma));
  return vec3(f, dense, n.a);
}

vec3 ctLut(float v) {
  v = clamp(v, 0.0, 1.0);
  vec3 c = mix(vec3(0.012, 0.02, 0.045), vec3(0.03, 0.2, 0.32), smoothstep(0.0, 0.25, v));
  c = mix(c, vec3(0.05, 0.6, 0.58), smoothstep(0.2, 0.48, v));
  c = mix(c, vec3(0.93, 0.66, 0.45), smoothstep(0.45, 0.74, v));
  return mix(c, vec3(1.0, 0.97, 0.9), smoothstep(0.72, 0.95, v));
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 uv = px / uRes;
  vec2 res = uRes / uDpr;
  float yTop = 1.0 - uv.y;
  vec2 profP = vec2(px.x, (1.0 - uScan) * uRes.y);

  /* ---- taps: centre, 4 at 1.2 px (blur), 8 at 5.5 px (unsharp, curvature, glint test), 1 on the CT slice row.
     The solid part (base) and the grazing-angle shell part of the tissue are summed separately: the shell only
     counts where the surface is curved or at an outline (normals change across the ring) — a flat plate seen
     at an angle stays a faint plate instead of glowing all over. */
  vec3 nC = vec3(0.0, 0.0, 1.0);
  float bC = 0.0, sC = 0.0, denC = 0.0, covC = 0.0;
  vec2 soft = vec2(0.0), ring = vec2(0.0), prof = vec2(0.0);
  float denRing = 0.0, curv = 0.0;
  for (int i = 0; i < 14; i++) {
    float k = float(i);
    float a = i < 5 ? k * 1.5708 + 0.785 : k * 0.785 + 0.39;
    float r = i == 0 ? 0.0 : i < 5 ? 1.2 : 5.5;
    vec2 q = i == 13 ? profP : px + vec2(cos(a), sin(a)) * r * uDpr;
    vec3 nn;
    vec3 m = matAt(q, nn);
    vec2 bs = m.z * vec2(0.17 + 0.17 * m.x, 1.05 * pow(1.0 - m.x, 2.4)) * 0.4;
    bs.x += m.y;
    if (i == 0) { nC = nn; bC = bs.x; sC = bs.y; denC = m.y; covC = m.z; }
    else if (i < 5) soft += bs;
    else if (i < 13) {
      ring += bs;
      denRing += m.y;
      curv = max(curv, max((1.0 - dot(nC, nn)) * m.z * covC, abs(m.z - covC)));
    }
    else prof = bs;
  }
  soft *= 0.25;
  ring *= 0.125;
  denRing *= 0.125;
  float kc = smoothstep(0.003, 0.03, curv);
  // a dense spot must be backed by its neighbourhood (rejects specular glints on ordinary scenes)
  float denE = min(denC, denRing * 2.6 + 0.04);
  float Dc = mix(bC - denC + denE + kc * sC, soft.x + kc * soft.y, 0.55);
  float Dring = ring.x + kc * ring.y;
  float Dprof = prof.x + 0.6 * prof.y;
  float Ds = max(Dc + 0.6 * (Dc - Dring), 0.0);          // unsharp mask
  float v = 1.0 - exp(-uDose * Ds * 2.1);

  vec2 vc = uv - 0.5;
  vec2 va = vc * vec2(uRes.x / uRes.y, 1.0);
  float vig = dot(va, va);
  float grain = hash12(floor(cp * 0.9) + uSeed * 13.7) - 0.5;
  float grain2 = vnoise(cp * 0.45 + uSeed * 3.1) - 0.5;

  /* ---- film on a light box */
  float lb = 0.84 + 0.16 * (1.0 - smoothstep(0.0, 0.7, vig)) + 0.03 * cos(uv.x * 6.2832 * 2.5 + 0.6) + (vnoise(uv * vec2(3.0, 2.0)) - 0.5) * 0.05;
  vec3 film = mix(vec3(0.02, 0.035, 0.06), vec3(0.8, 0.89, 0.97), pow(clamp(v, 0.0, 1.0), 1.1));
  film *= lb;
  film += (grain * 0.05 + grain2 * 0.03) * (0.3 + v);
  film *= 1.0 - 0.5 * smoothstep(0.1, 0.65, vig);

  /* ---- CT pseudo-colour: circular field, slice band with contours and a density profile */
  float bandH = 0.15;
  float dy = abs(yTop - uScan);
  float inBand = 1.0 - smoothstep(bandH * 0.5 - 0.003, bandH * 0.5, dy);
  vec3 lut = ctLut(v);
  float iso = fract(Ds * 7.0);
  float contour = covC * smoothstep(0.86, 0.95, iso) * (1.0 - smoothstep(0.95, 1.0, iso));
  vec3 ct = mix(lut * 0.5 + luma(lut) * 0.12, lut + contour * vec3(0.5, 0.9, 1.0) * 0.5, inBand);
  float vp = 1.0 - exp(-uDose * Dprof * 2.1);
  float yBase = uScan + bandH * 0.5;
  float yLine = yBase - vp * bandH * 0.82;
  ct += vec3(0.3, 0.95, 1.0) * inBand * step(0.02, vp) * (step(yLine, yTop) * (0.08 + 0.14 * smoothstep(yBase, yLine, yTop)) + exp(-abs(yTop - yLine) * res.y * 0.9) * 0.9);
  float edgeY = abs(dy - bandH * 0.5) * res.y;
  ct += vec3(0.35, 0.95, 1.0) * exp(-edgeY * 1.2) * 0.9;
  float tick = step(fract(cp.x / 24.0), 0.06) * step(dy, bandH * 0.5 + 6.0 / res.y) * step(bandH * 0.5, dy);
  ct += vec3(0.35, 0.95, 1.0) * tick * 0.6;
  // reconstruction circle
  float R = min(res.x, res.y) * 0.47;
  float dc = length(cp - res * 0.5);
  ct *= 1.0 - 0.75 * smoothstep(R - 2.0, R + 2.0, dc);
  ct += vec3(0.25, 0.75, 0.85) * exp(-abs(dc - R) * 0.9) * 0.35;
  vec2 gq = abs(fract(cp / 48.0) - 0.5) * 48.0;
  ct += vec3(0.2, 0.6, 0.7) * (1.0 - smoothstep(0.0, 0.8, min(gq.x, gq.y))) * 0.05;
  ct += grain * 0.03;

  /* ---- baggage scanner: class colour by dense, darkness by total attenuation */
  vec3 cls = mix(vec3(0.97, 0.56, 0.12), vec3(0.22, 0.7, 0.28), smoothstep(0.24, 0.38, denE));
  cls = mix(cls, vec3(0.16, 0.34, 0.86), smoothstep(0.56, 0.76, denE));
  float I = exp(-uDose * Ds * 1.9);
  cls *= mix(1.0, 0.22, smoothstep(0.55, 0.97, 1.0 - I));
  vec3 bgS = vec3(0.95, 0.955, 0.94) - (hash12(vec2(floor(cp.y * 0.5), 3.0)) - 0.5) * 0.025;
  vec3 scan = mix(cls, bgS, I);
  scan += grain * 0.02;

  vec3 col = film * uW.x + ct * uW.y + scan * uW.z;

  /* ---- handheld scanner lens */
  if (uLens.w > 0.001) {
    vec3 lc = linL(px);
    vec3 orig = clamp(linearToSrgb(lc / (1.0 + lc * 0.12)), 0.0, 1.0) * 0.82;
    float d = length(px - uLens.xy);
    float Rl = uLens.z;
    float inL = 1.0 - smoothstep(Rl - 1.5 * uDpr, Rl + 1.5 * uDpr, d);
    col = mix(col, mix(orig, col, inL), uLens.w);
    float ring = exp(-abs(d - Rl) / (1.1 * uDpr));
    float ang = atan(px.y - uLens.y, px.x - uLens.x);
    float tk = step(0.9, fract(ang / 6.2832 * 72.0)) * step(Rl, d) * step(d, Rl + 7.0 * uDpr);
    float shade = smoothstep(Rl, Rl + 26.0 * uDpr, d) * (1.0 - smoothstep(Rl + 26.0 * uDpr, Rl + 60.0 * uDpr, d));
    col = mix(col, col * 0.7, (1.0 - shade) * step(Rl, d) * 0.5 * uLens.w);
    col += vec3(0.75, 0.92, 1.0) * (ring * 0.85 + tk * 0.5) * uLens.w;
  }
  return col;
}
`,c={film:0,ct:1,scan:2};function l(e={}){let n=e.mode??`film`,i=[0,0,0];i[c[n]]=1;let o={mode:n,w:[...i],target:[...i],dose:e.dose??1,doseTarget:e.dose??1,lens:{x:0,y:0,r:120,on:!1},lensK:0,t:0,scanT:0},l={uW:{value:new t(...i)},uDose:{value:o.dose},uLens:{value:new r(0,0,100,0)},uScan:{value:.5},uT:{value:0},uSeed:{value:0}};return{frag:s,uniforms:l,normals:!0,background:a.background,xray:o,update(e,t){o.t+=e;let n=Math.min(1,e*4);for(let e=0;e<3;e++)o.w[e]+=(o.target[e]-o.w[e])*n;l.uW.value.set(o.w[0],o.w[1],o.w[2]),o.dose+=(o.doseTarget-o.dose)*Math.min(1,e*5),l.uDose.value=o.dose,o.lensK+=(+!!o.lens.on-o.lensK)*Math.min(1,e*7),l.uLens.value.set(o.lens.x*t.dpr,t.height-o.lens.y*t.dpr,o.lens.r*t.dpr,o.lensK),o.scanT+=e;let r=o.scanT/7%1,i=r<.5?r*2:2-r*2;l.uScan.value=.14+.72*(i*i*(3-2*i)),l.uT.value=o.t,l.uSeed.value=Math.floor(o.t*18)%256}}}function u(e,t){let n=e.xray;n&&n.mode!==t&&(n.mode=t,n.target=[0,0,0],n.target[c[t]]=1)}function d(e,t){let n=e.xray;n&&(n.doseTarget=t)}function f(e,t){let n=e.xray;n&&Object.assign(n.lens,t)}function p(e){return e.uniforms?.uScan.value??.5}export{a,p as c,u as i,d as n,i as o,f as r,o as s,l as t};