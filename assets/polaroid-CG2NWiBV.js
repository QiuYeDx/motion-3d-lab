import{_n as e,vn as t}from"./events-9ce18a08.esm-BkDjjFw8.js";var n=[{id:`sx70`,label:`SX-70`},{id:`p600`,label:`600`},{id:`expired`,label:`过期相纸`}],r={title:`拍立得`,en:`Polaroid`,background:`#cfdde0`,theme:`light`},i={sx70:{black:[.14,.18,.18],white:[.99,.94,.82],cast:[1.03,1,.93],sat:.84,contrast:1.02,soft:1,vig:.6,chem:.6,leak:.7,blotch:0,split:1},p600:{black:[.06,.09,.105],white:[.97,.965,.92],cast:[.95,1,1.05],sat:.98,contrast:1.32,soft:.35,vig:.5,chem:.42,leak:.35,blotch:0,split:.75},expired:{black:[.26,.15,.22],white:[1,.86,.72],cast:[1.12,.86,.92],sat:.6,contrast:.72,soft:.8,vig:.7,chem:1,leak:1,blotch:1,split:1.3}},a=[`sat`,`contrast`,`soft`,`vig`,`chem`,`leak`,`blotch`,`split`],o=[`black`,`white`,`cast`],s=(e,t,n)=>{let r={...e};for(let i of a)r[i]=e[i]+(t[i]-e[i])*n;for(let i of o)r[i]=[0,1,2].map(r=>e[i][r]+(t[i][r]-e[i][r])*n);return r},c=`
uniform vec4 uFrame;      // print: centre (CSS px, from top-left), half image size, tilt (rad); z < 0 → full-bleed
uniform vec3 uView;       // where the camera framed the picture: centre + half size (CSS px)
uniform float uSlot;      // the print is hidden above this line (CSS px from the top): still inside the camera
uniform vec3 uBlack, uWhite, uCast;
uniform float uSat, uContrast, uSoft, uVig, uChem, uLeak, uBlotch, uSplit;
uniform float uDev;       // 0 … 1 development
uniform float uSeed;      // per print: where the leak / dust / scratch fall

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

vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}

/* the picture. spx: scene sample point (device px), iuv: 0..1 across the image (y down), asp: width / height,
   ip: CSS px per image unit (for grain / dust size) */
vec3 film(vec2 spx, vec2 iuv, float asp, float ip) {
  vec2 ic = (iuv - 0.5) * vec2(asp, 1.0) / max(asp, 1.0) * 2.0;   // -1..1 on the long side
  float corner = clamp(dot(ic, ic) * 0.5, 0.0, 1.0);

  /* lens: soft focus + halation, one loop */
  vec3 c0 = sceneL(spx);
  vec3 near = vec3(0.0), far = vec3(0.0);
  float r1 = (0.7 + 1.1 * uSoft + 1.6 * corner) * uDpr;
  float r2 = (7.0 + 5.0 * uSoft) * uDpr;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982 + 0.39;
    vec2 d = vec2(cos(a), sin(a));
    near += sceneL(spx + d * r1);
    far += sceneL(spx + d.yx * vec2(1.0, -1.0) * r2);
  }
  near /= 8.0;
  far /= 8.0;
  vec3 c = mix(c0, near, clamp(0.25 + 0.4 * uSoft + 0.3 * corner, 0.0, 1.0));
  vec3 glow = max(far - 0.62, 0.0);
  c += glow * vec3(1.0, 0.85, 0.7) * (0.5 + 0.6 * uSoft);

  /* colour science */
  float L = luma(c);
  c = mix(vec3(L), c, uSat);
  c *= uCast;
  // cross-processed split tone: teal shadows, yellow highlights
  float sh = (1.0 - L) * (1.0 - L);
  float hi = L * L;
  c += uSplit * (sh * vec3(-0.05, 0.03, 0.045) + hi * vec3(0.05, 0.025, -0.07));
  // soft S-curve into lifted, tinted blacks and creamy whites
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.55);
  c = uBlack + (uWhite - uBlack) * c;

  /* chemistry */
  vec2 e = vec2(min(iuv.x, 1.0 - iuv.x), 1.0 - iuv.y) * vec2(asp, 1.0) / max(asp, 1.0);
  float top = iuv.y * min(asp, 1.0);
  float edgeN = vnoise(vec2(iuv.x * 16.0 + uSeed, iuv.y * 3.0)) - 0.5;
  float rim = smoothstep(0.045, 0.0, min(e.x, e.y) + edgeN * 0.02) * uChem;
  c = mix(c, c * vec3(0.72, 0.82, 0.86), rim * 0.7);
  // the reagent didn't quite reach the top: ragged fingers, under-developed and warm
  float reach = 0.035 + (vnoise(vec2(iuv.x * 9.0 + uSeed * 3.0, 0.5)) * 0.06 + vnoise(vec2(iuv.x * 31.0, uSeed)) * 0.025) * uChem;
  float finger = smoothstep(reach, reach - 0.012, top) * step(0.05, uChem);
  c = mix(c, vec3(0.93, 0.78, 0.55) * mix(vec3(1.0), uCast, 0.5), finger * 0.85);
  float tide = exp(-pow((top - reach) / 0.006, 2.0)) * uChem * 0.25;
  c *= 1.0 - tide;
  // expired stock: mottled patches of magenta / orange
  float bl = fbm(iuv * vec2(asp, 1.0) * 3.2 + uSeed * 1.7);
  float b2 = fbm(iuv * vec2(asp, 1.0) * 6.5 + 9.0 + uSeed);
  c = mix(c, c * vec3(1.12, 0.78, 1.0), smoothstep(0.55, 0.75, bl) * 0.55 * uBlotch);
  c = mix(c, c * vec3(1.15, 0.92, 0.7), smoothstep(0.6, 0.78, b2) * 0.45 * uBlotch);

  /* vignette */
  c *= 1.0 - uVig * smoothstep(0.15, 1.0, corner) * 0.85;
  c = mix(c, c * vec3(0.9, 0.95, 1.05), smoothstep(0.3, 1.0, corner) * 0.4);

  /* light leak creeping in from one edge: warm streaks, red at the edge, amber further in */
  float dEdge = (uSeed < 4.0 ? 1.0 - iuv.x : iuv.x) * asp / max(asp, 1.0);
  float ly = iuv.y * 1.0 + dEdge * 0.9;           // the streaks lean as they come in
  float streak = smoothstep(0.15, 0.95, 0.5 + 0.5 * sin(ly * 7.0 + uSeed * 1.3) * sin(ly * 2.3 + uSeed));
  float reachL = 0.1 + 0.16 * streak;
  float leak = exp(-dEdge / reachL) * (0.35 + 0.65 * streak) * uLeak;
  vec3 leakCol = mix(vec3(1.0, 0.42, 0.16), vec3(1.0, 0.16, 0.08), exp(-dEdge / 0.04));
  leakCol = mix(vec3(1.0, 0.78, 0.4), leakCol, smoothstep(0.0, 0.5, leak));
  c = 1.0 - (1.0 - c) * (1.0 - leakCol * min(leak, 1.0) * 0.9);

  /* development: cyan dye first (red channel), magenta, yellow last; contrast builds from the centre */
  float dv = clamp(uDev * 1.12 - corner * 0.08 - (vnoise(iuv * 5.0 + uSeed) - 0.5) * 0.08, 0.0, 1.0);
  vec3 base = vec3(0.56, 0.6, 0.63) + (vnoise(iuv * 3.0) - 0.5) * 0.03;
  vec3 ch = vec3(smoothstep(0.02, 0.5, dv), smoothstep(0.18, 0.72, dv), smoothstep(0.38, 1.0, dv));
  vec3 cDev = mix(vec3(luma(c)), c, smoothstep(0.3, 1.0, dv));
  cDev = mix(vec3(0.6), cDev, 0.35 + 0.65 * smoothstep(0.0, 0.85, dv));
  c = mix(base, cDev, ch);

  /* physical print: static grain, dust, a hairline scratch */
  vec2 gp = iuv * ip;
  float gr = (hash12(floor(gp / 1.3) + uSeed) - 0.5) * 0.05 + (vnoise(gp * 0.7) - 0.5) * 0.035;
  c += gr * (0.5 + L);
  vec2 dc = floor(gp / 3.0);
  float dh = hash12(dc + uSeed * 7.0);
  vec2 dp = fract(gp / 3.0) - 0.5;
  float speck = step(0.9993, dh) * smoothstep(0.42, 0.15, length(dp));
  c = mix(c, hash12(dc + 3.1) > 0.3 ? vec3(0.97, 0.96, 0.93) : uBlack * 0.7, speck * 0.8);
  vec2 sd = rot(0.35 + uSeed * 0.2) * (iuv - vec2(0.3 + uSeed * 0.05, 0.5));
  float scratch = smoothstep(0.0012, 0.0, abs(sd.x + sin(sd.y * 6.0) * 0.01)) * step(abs(sd.y), 0.28) * 0.45;
  c = mix(c, vec3(0.95, 0.93, 0.88), scratch * (0.4 + 0.6 * uChem));
  return clamp(c, 0.0, 1.0);
}

vec3 tableAt(vec2 cp) {
  // pale oak boards running across
  float plank = floor(cp.y / 150.0);
  float wy = cp.y + vnoise(vec2(cp.x / 260.0, plank)) * 18.0;
  float grain = fbm(vec2(cp.x / 380.0 + plank * 7.0, wy / 5.0));
  float fine = vnoise(vec2(cp.x / 30.0, wy / 1.2));
  vec3 c = vec3(0.86, 0.77, 0.63) * (0.9 + 0.1 * hash12(vec2(plank, 2.0)));
  c *= 1.0 - 0.1 * smoothstep(0.45, 0.8, grain) - 0.03 * fine;
  float seam = smoothstep(1.6, 0.0, abs(mod(cp.y, 150.0) - 1.0));
  c *= 1.0 - seam * 0.22;
  return c;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 res = uRes / uDpr;
  vec2 cd = vec2(cp.x, res.y - cp.y);          // CSS px from the top-left, like the DOM

  if (uFrame.z < 0.0) {
    // full-bleed: the screen is the picture
    vec2 iuv = cd / res;
#ifdef RAW
    return sceneL(px);
#else
    return film(px, iuv, res.x / res.y, max(res.x, res.y));
#endif
  }

  float s = uFrame.z;
  vec2 q = rot(-uFrame.w) * (cd - uFrame.xy);    // print-local, y down
  float side = s * 0.12, topB = s * 0.15, botB = s * 0.56;
  vec2 fc = vec2(0.0, (botB - topB) * 0.5);       // frame centre relative to the image centre
  vec2 fh = vec2(s + side, s + (topB + botB) * 0.5);

  vec3 col = tableAt(cp);
  // soft contact shadow, light from the upper left
  vec2 qs = rot(-uFrame.w) * (cd - uFrame.xy - vec2(5.0, 9.0));
  float shd = sdBox(qs - fc, fh - 3.0);
  float vis = step(uSlot, cd.y);                  // still inside the camera above the slot
  col *= 1.0 - 0.3 * smoothstep(20.0, -6.0, shd) * vis;

  float df = sdBox(q - fc, fh - 2.0) - 2.0;       // rounded corners
  float inFrame = smoothstep(0.7, -0.7, df) * vis;
  if (inFrame > 0.0) {
    // matte white frame with a faint texture, slightly darker toward its edge
    vec3 fr = vec3(0.955, 0.945, 0.925) * (0.985 + 0.015 * vnoise(q * 0.5)) - 0.02 * smoothstep(-6.0, 0.0, df);
    float di = sdBox(q, vec2(s));
    vec3 c = fr;
    if (di < 0.6) {
      vec2 iuv = q / (2.0 * s) + 0.5;
      vec2 v = uView.xy + q * (uView.z / s);
      vec2 spx = vec2(v.x, res.y - v.y) * uDpr;
#ifdef RAW
      vec3 ph = sceneL(spx);
#else
      vec3 ph = film(spx, iuv, 1.0, 2.0 * s);
#endif
      c = mix(fr, ph, smoothstep(0.6, -0.6, di));
    }
    // the frame stands a hair proud of the picture: inner shadow along the window's top / left edges
    if (di < 0.0) c *= 1.0 - 0.16 * smoothstep(3.0, 0.0, min(q.x + s, q.y + s));
    col = mix(col, c, inFrame);
  }
  return clamp(col, 0.0, 1.0);
}
`,l=6.2;function u(n={}){let o=n.mode??`sx70`,u={from:i[o],to:i[o],cur:i[o],k:1,mode:o,dev:l},d={uFrame:{value:new t(0,0,-1,0)},uView:{value:new e(0,0,1)},uSlot:{value:-1e5},uBlack:{value:new e},uWhite:{value:new e},uCast:{value:new e},uSat:{value:1},uContrast:{value:1},uSoft:{value:1},uVig:{value:.5},uChem:{value:.5},uLeak:{value:.5},uBlotch:{value:0},uSplit:{value:1},uDev:{value:1},uSeed:{value:2.3}},f=()=>{let e=u.cur;d.uBlack.value.set(...e.black),d.uWhite.value.set(...e.white),d.uCast.value.set(...e.cast);for(let t of a)d[`u`+t[0].toUpperCase()+t.slice(1)].value=e[t]};f();let p=e=>e*e*(3-2*e);return{frag:c,uniforms:d,background:r.background,pol:u,update(e){u.shown===void 0&&(u.shown=performance.now()),u.k<1&&(u.k=Math.min(1,u.k+e/.8),u.cur=s(u.from,u.to,p(u.k)),f()),u.dev<l&&(u.dev=Math.min(l,u.dev+e)),d.uDev.value=u.dev/l}}}function d(e){return{frag:`#define RAW
`+c,uniforms:e.uniforms,background:e.background}}function f(e,t){let n=e.pol;n&&n.mode!==t&&(n.mode=t,n.from=n.cur,n.to=i[t],n.k=0)}function p(e,t={}){let n=e.pol;n&&(n.dev=0,t.reseed!==!1&&e.uniforms&&(e.uniforms.uSeed.value=Math.round(Math.random()*79)/10))}function m(e){let t=e.pol;t&&(t.dev=l),e.uniforms&&(e.uniforms.uDev.value=1)}function h(e){let t=e.pol;return t?t.dev/l:1}function g(e,t,n){let r=e.uniforms;if(!r)return;if(!t){r.uFrame.value.set(0,0,-1,0);return}r.uFrame.value.set(t.x,t.y,t.s,t.angle??0);let i=n??t;r.uView.value.set(i.x,i.y,i.s)}function _(e,t){e.uniforms&&(e.uniforms.uSlot.value=t??-1e5)}export{r as a,g as c,m as i,f as l,d as n,n as o,p as r,h as s,u as t,_ as u};