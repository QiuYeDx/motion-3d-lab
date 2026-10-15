import{N as e,_n as t}from"./events-9ce18a08.esm-BkDjjFw8.js";var n=[{id:`neon`,label:`霓虹灯`},{id:`laser`,label:`激光`},{id:`tron`,label:`蓝图光`}],r={title:`霓虹线稿`,en:`Neon Lines`,background:`#06050a`,theme:`dark`},i=`
uniform vec3 uW;        // mode weights: neon, laser, tron
uniform float uR;       // line ring radius, CSS px
uniform float uGlowR;   // glow radius scale
uniform float uGlow;    // glow gain
uniform float uCrease;  // normal crease threshold (1 - dot)
uniform float uT;       // effect clock, s
uniform float uPowerT;  // seconds since power-on
uniform float uFlick;   // 0..1 random tube stutter
uniform vec3 uFallback; // neon colour for neutral objects

vec4 nrmL(vec2 p) { return textureLod(tNormal, p / uRes, 0.0); }
vec3 colL(vec2 p) {
  vec3 c = textureLod(tScene, p / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float zL(vec2 p) {
  float d = textureLod(tDepth, p / uRes, 0.0).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
vec2 hash22(vec2 p) { return vec2(hash12(p), hash12(p + 17.17)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 chroma(vec3 c) { return c / (c.r + c.g + c.b + 0.06); }
// saturated hue (max channel 1, min 0) + how coloured the source was
vec4 hueOf(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / (mx + 0.02);
  vec3 h = (c - mn) / max(mx - mn, 1e-3);
  h = pow(h, vec3(1.25));
  return vec4(h, smoothstep(0.1, 0.32, sat));
}
// the tube colour a hue becomes in the current mode
vec3 modeCol(vec4 hs) {
  vec3 h = hs.rgb;
  float s = hs.a;
  float warm = s * smoothstep(0.15, 0.55, h.r - max(h.g * 0.8, h.b));
  vec3 neon = mix(uFallback, h, s);
  vec3 laser = mix(vec3(0.16, 1.0, 0.22), vec3(1.0, 0.1, 0.08), warm);
  vec3 tron = mix(vec3(0.22, 0.92, 1.0), vec3(1.0, 0.52, 0.1), warm * 0.9);
  return neon * uW.x + laser * uW.y + tron * uW.z;
}

// Voronoi tube cells (CSS px): x = distance to the border, y = own id, z = neighbour id, w = own centre x (0..1)
vec4 cells(vec2 cp) {
  float S = 140.0;
  vec2 x = cp / S;
  vec2 n = floor(x), f = fract(x);
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g) * 0.8 + 0.1;
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float bd = 8.0;
  vec2 ng = mg;
  for (int j = -2; j <= 2; j++)
  for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 o = hash22(n + g) * 0.8 + 0.1;
    vec2 r = g + o - f;
    vec2 dr = r - mr;
    if (dot(dr, dr) > 1e-5) {
      float d = dot(0.5 * (mr + r), normalize(dr));
      if (d < bd) { bd = d; ng = g; }
    }
  }
  float own = hash12((n + mg) * 1.37 + 4.1);
  float nb = hash12((n + ng) * 1.37 + 4.1);
  float cx = ((n.x + mg.x + 0.5) * S) / (uRes.x / uDpr);
  return vec4(bd * S, own, nb, cx);
}

// brightness of one tube (cell): power-on buzz, then steady with the odd stutter
float tubePower(float id, float cx) {
  float tOn = 0.2 + clamp(cx, 0.0, 1.0) * 1.15 + id * 0.55;
  float t = uPowerT - tOn;
  float p = step(0.0, t);
  float buzz = step(0.62 - t * 1.1, hash12(vec2(id * 91.7, floor(uPowerT * 26.0))));
  p *= t < 0.5 ? buzz * (0.55 + 0.45 * t * 2.0) : 1.0;
  float slot = floor(uT * 0.9 + id * 7.0);
  float act = step(1.0 - 0.06 * uFlick, hash12(vec2(id * 37.3, slot)));
  float stut = step(0.42, hash12(vec2(id * 13.1, floor(uT * 21.0))));
  p *= mix(1.0, 0.1 + 0.9 * stut, act);
  return p;
}

// procedural brick wall, albedo 0..1 (CSS px)
float brick(vec2 cp) {
  vec2 b = vec2(66.0, 27.0);
  float row = floor(cp.y / b.y);
  vec2 q = vec2(cp.x / b.x + 0.5 * mod(row, 2.0), cp.y / b.y);
  vec2 id = floor(q);
  vec2 l = fract(q) * b;
  float m = min(min(l.x, b.x - l.x), min(l.y, b.y - l.y));
  float mortar = smoothstep(1.4, 3.2, m + (vnoise(cp * 0.4) - 0.5) * 1.6);
  float tone = 0.5 + 0.5 * hash12(id + 3.3);
  float grit = vnoise(cp * 0.23 + id * 5.0) * 0.5 + vnoise(cp * 0.9) * 0.3 + hash12(floor(cp)) * 0.2;
  return mix(0.18, (0.45 + 0.4 * tone) * (0.7 + 0.45 * grit), mortar);
}

vec3 stylize(vec2 px) {
  vec2 cp0 = px / uDpr;
  // laser: the beam wobbles a little row by row
  float jit = (vnoise(vec2(cp0.y / 14.0, uT * 7.0)) - 0.5) * 1.3 * uW.y;
  vec2 p = px + vec2(jit * uDpr, 0.0);
  vec2 cp = p / uDpr;

  vec4 nC = nrmL(p);
  float zC = zL(p);
  vec3 cC = colL(p);
  vec3 nnC = normalize(nC.rgb * 2.0 - 1.0);
  vec3 chC = chroma(cC);

  /* ---- line: 8 tap pairs (4 at r, 4 at r/2) */
  float r = uR * uDpr;
  float outer = 0.0, inner = 0.0;
  vec4 lineHue = vec4(0.0);
  float lineW = 0.0;
  for (int i = 0; i < 8; i++) {
    float k = float(i);
    float ring = i < 4 ? 1.0 : 0.5;
    float a = k * 0.785398 + (i < 4 ? 0.0 : 0.3927);
    vec2 d = vec2(cos(a), sin(a)) * r * ring;
    vec2 pa = p + d, pb = p - d;
    vec4 nA = nrmL(pa), nB = nrmL(pb);
    float zA = zL(pa), zB = zL(pb);
    vec3 cA = colL(pa), cB = colL(pb);
    float covAll = nA.a * nB.a * nC.a;
    float eCov = max(abs(nA.a - nC.a), abs(nB.a - nC.a));
    float iz = (1.0 / zA + 1.0 / zB - 2.0 / zC) * zC;
    float eZ = covAll * smoothstep(0.004, 0.014, abs(iz) / ring);
    vec3 nnA = normalize(nA.rgb * 2.0 - 1.0), nnB = normalize(nB.rgb * 2.0 - 1.0);
    float dn = max(1.0 - dot(nnA, nnC), 1.0 - dot(nnB, nnC));
    float eN = covAll * smoothstep(uCrease, uCrease * 2.2 + 0.05, dn);
    float dc = max(length(chroma(cA) - chC), length(chroma(cB) - chC));
    float eC = nC.a * smoothstep(0.16, 0.3, dc);
    float e = max(max(eCov, eZ), max(eN, eC));
    // the front-most of the three samples gives the tube its colour
    float zF = zC;
    vec3 cF = cC;
    float wa = step(zA, zF - 1e-4) * nA.a;
    cF = mix(cF, cA, wa); zF = mix(zF, zA, wa);
    float wb = step(zB, zF - 1e-4) * nB.a;
    cF = mix(cF, cB, wb);
    lineHue += e * hueOf(cF);
    lineW += e;
    if (i < 4) outer += e; else inner += e;
  }
  outer *= 0.25;
  inner *= 0.25;
  float frac = outer * 0.55 + inner * 0.45;

  /* ---- glow: 15 tap pairs on a golden-angle spiral, radius 3.5 → 31 CSS px. Each pair lights a band of
     half-width R·|cos φ| around an edge; with every pair at its own radius and angle the bands stack into a
     smooth falloff (no ghost copies), a touch of per-pixel radius jitter dissolves the remaining steps. */
  vec4 glowHue = vec4(0.0);
  float glow = 0.0, wash = 0.0, glowE = 0.0;
  float ign = fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
  float jr = 0.86 + 0.28 * ign;
  for (int i = 0; i < 15; i++) {
    float k = float(i);
    float R = 3.2 * pow(1.2, k) * jr * uGlowR * uDpr;
    float a = k * 2.39996 + 0.3 + (ign - 0.5) * 0.5;
    vec2 d = vec2(cos(a), sin(a)) * R;
    vec2 pa = p + d, pb = p - d;
    vec4 nA = nrmL(pa), nB = nrmL(pb);
    vec3 cA = colL(pa), cB = colL(pb);
    float eCov = abs(nA.a - nB.a);
    float eN = i < 5 ? nA.a * nB.a * smoothstep(0.55, 0.95, 1.0 - dot(normalize(nA.rgb * 2.0 - 1.0), normalize(nB.rgb * 2.0 - 1.0))) : 0.0;
    float eC = nA.a * nB.a * smoothstep(0.2, 0.36, length(chroma(cA) - chroma(cB)));
    float e = max(eCov, max(eN, eC));
    // colour of the covered side (or the brighter one when both are covered)
    float front = nA.a > nB.a + 0.5 ? 1.0 : nB.a > nA.a + 0.5 ? 0.0 : step(luma(cB), luma(cA));
    vec3 cF = mix(cB, cA, front);
    float w = pow(0.87, k);
    glowHue += e * w * hueOf(cF);
    glowE += e * w;
    glow += e * w;
    wash += e * (0.3 + k / 14.0);
  }
  glow /= 6.0;   // ≈ Σ 0.87^k
  wash /= 15.0;

  vec3 lineCol = modeCol(lineHue / max(lineW, 1e-3));
  vec3 glowCol = modeCol(glowHue / max(glowE, 1e-3));

  /* ---- tubes: segment gaps, electrode caps, power + flicker (neon mode) */
  vec4 cl = cells(cp);
  float pOwn = tubePower(cl.y, cl.w);
  float pNb = tubePower(cl.z, cl.w);
  float bdist = cl.x;
  float gapW = 3.0 + uR * 1.2;
  float gap = mix(1.0, smoothstep(gapW * 0.55, gapW * 1.25, bdist), uW.x);
  float cap = uW.x * (1.0 - smoothstep(gapW * 1.25, gapW * 1.25 + 5.0, bdist));
  float pLine = mix(1.0, pOwn, uW.x);
  float pGlow = mix(1.0, mix(0.5 * (pOwn + pNb), pOwn, smoothstep(0.0, 36.0, bdist)), uW.x);

  /* ---- laser sweep */
  float yTop = 1.0 - px.y / uRes.y;
  float period = 2.6;
  float ph = fract(uT / period) * 1.15 - 0.075;
  float age = fract((ph - yTop) / 1.15) * period;
  float reveal = 0.22 + 0.78 * exp(-age * 1.5);
  float beam = exp(-abs(yTop - ph) * uRes.y / (uDpr * 2.2));
  float speck = 0.65 + 0.7 * hash12(floor(cp * 0.8) + floor(uT * 30.0));
  float laserK = mix(1.0, reveal * speck, uW.y);

  float line = smoothstep(0.12, 0.62, frac);
  float core = smoothstep(0.55, 0.95, inner) * smoothstep(0.35, 0.8, outer);
  float on = pLine * gap;
  vec3 E = lineCol * line * 1.5 * on * laserK;
  E += vec3(1.0, 0.97, 0.94) * core * on * mix(1.0, 0.75, uW.y) * laserK;
  // electrode caps: the tube end is a dimmer, paler stub
  E += mix(lineCol, vec3(0.8), 0.6) * line * cap * gap * 0.18 * pLine;
  // an unlit tube is still faintly visible glass
  E += vec3(0.05, 0.05, 0.06) * line * gap * (1.0 - pLine) * uW.x;
  E += glowCol * glow * uGlow * pGlow * mix(1.0, reveal, uW.y) * (0.6 + 0.4 * gap);
  // the laser beam itself: faint across the haze, white-hot where it strikes an edge
  E += vec3(0.16, 1.0, 0.24) * uW.y * beam * (0.05 + line * 2.2);

  /* ---- inside shapes: a faint fill (neon), hologram scanlines (tron) */
  vec3 hC = modeCol(hueOf(cC));
  float scan = 0.5 + 0.5 * sin(cp.y * 1.4 - uT * 6.0);
  float fill = nC.a * (0.035 * uW.x + 0.012 * uW.y + (0.05 + 0.05 * scan) * uW.z);
  E += hC * fill * (0.4 + 0.6 * pGlow) * (1.0 - line);

  /* ---- background: brick wall lit by the glow (neon / laser), grid floor (tron) */
  float bg = 1.0 - nC.a;
  float br = brick(cp);
  vec3 wallLight = glowCol * (wash * 1.2 + glow * 0.8) * uGlow * pGlow;
  vec3 wall = br * (vec3(0.012, 0.011, 0.016) + wallLight * 0.9);
  // tron: perspective floor below a horizon, dark sky above
  vec2 res = uRes / uDpr;
  float hz = 0.56;
  float s = (yTop - hz) / (1.0 - hz);
  vec3 tronBg = mix(vec3(0.004, 0.012, 0.03), vec3(0.0, 0.04, 0.08), smoothstep(0.0, hz, yTop));
  if (s > 0.0) {
    float zf = 1.0 / s;
    float xf = (cp.x - res.x * 0.5) / (res.y * 0.32) * zf;
    float gz = zf * 1.6 + uT * 0.7;
    float fwx = zf / (res.y * 0.32);
    float fwz = 1.6 / (s * s * (1.0 - hz) * res.y);
    float gx = abs(fract(xf) - 0.5);
    float gzz = abs(fract(gz) - 0.5);
    float lx = 1.0 - smoothstep(0.0, fwx * 1.6, 0.5 - gx);
    float lz = 1.0 - smoothstep(0.0, fwz * 1.6, 0.5 - gzz);
    float g = max(lx, lz) * smoothstep(0.0, 0.25, s);
    tronBg += vec3(0.1, 0.75, 1.0) * g * 0.55 + vec3(0.0, 0.12, 0.2) * s * 0.5;
  }
  tronBg += vec3(0.15, 0.7, 1.0) * exp(-abs(yTop - hz) * 60.0) * 0.35;
  tronBg += glowCol * wash * uGlow * 0.5;
  vec3 back = wall * (uW.x + uW.y * 0.55) + tronBg * uW.z;
  E += back * bg;

  // vignette, tone map (white-hot where it's bright), a little dither so the glow never bands
  vec2 vc = px / uRes - 0.5;
  E *= 1.0 - dot(vc, vc) * 0.55;
  vec3 col = 1.0 - exp(-E * 1.25);
  col += (hash12(px + fract(uT) * 91.0) - 0.5) / 255.0;
  return col;
}
`,a={neon:{r:1,glowR:1,glow:1,crease:.32},laser:{r:.55,glowR:.55,glow:.65,crease:.4},tron:{r:.8,glowR:.8,glow:.85,crease:.13}},o={neon:0,laser:1,tron:2};function s(n={}){let s=n.mode??`neon`,c=[0,0,0];c[o[s]]=1;let l={mode:s,w:[...c],target:[...c],lineW:n.lineWidth??1.5,glow:n.glow??1,t:0,powerT:0},u={uW:{value:new t(...c)},uR:{value:l.lineW},uGlowR:{value:1},uGlow:{value:1},uCrease:{value:.32},uT:{value:0},uPowerT:{value:0},uFlick:{value:1},uFallback:{value:new e(1,.62,.86)}};return{frag:i,uniforms:u,normals:!0,background:r.background,neon:l,update(e){l.t+=e,l.powerT+=e;let t=Math.min(1,e*4);for(let e=0;e<3;e++)l.w[e]+=(l.target[e]-l.w[e])*t;u.uW.value.set(l.w[0],l.w[1],l.w[2]);let n=0,r=0,i=0,o=0;[`neon`,`laser`,`tron`].forEach((e,t)=>{n+=a[e].r*l.w[t],r+=a[e].glowR*l.w[t],i+=a[e].glow*l.w[t],o+=a[e].crease*l.w[t]}),u.uR.value=n*l.lineW,u.uGlowR.value=r,u.uGlow.value=i*l.glow,u.uCrease.value=o,u.uT.value=l.t,u.uPowerT.value=Math.min(l.powerT,1e4)}}}function c(e,t){let n=e.neon;n&&n.mode!==t&&(n.mode=t,n.target=[0,0,0],n.target[o[t]]=1)}function l(e,t){let n=e.neon;n&&(n.lineW=t)}function u(e,t){let n=e.neon;n&&(n.glow=t)}function d(e){let t=e.neon;t&&(t.powerT=0)}function f(e){let t=e.neon;t&&(t.powerT=1e4)}function p(e,t){let n=e.uniforms;n&&(n.uFlick.value=+!!t)}export{d as a,l as c,n as i,c as l,f as n,p as o,r,u as s,s as t};