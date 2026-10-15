import{_n as e,vn as t}from"./events-9ce18a08.esm-BkDjjFw8.js";var n=[{id:`classic`,label:`经典`},{id:`photogram`,label:`植物标本`},{id:`toned`,label:`调色`}],r={title:`蓝晒`,en:`Cyanotype`,background:`#ece6d6`,theme:`light`},i={classic:{photo:0,paper:[.95,.93,.86],light:[.64,.77,.82],mid:[.17,.44,.58],deep:[.05,.15,.36],gamma:1},photogram:{photo:1,paper:[.96,.95,.9],light:[.7,.81,.86],mid:[.18,.42,.6],deep:[.04,.13,.34],gamma:1},toned:{photo:0,paper:[.93,.86,.73],light:[.78,.7,.66],mid:[.44,.34,.38],deep:[.19,.12,.15],gamma:1.1}},a=(e,t,n)=>[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n],o=(e,t,n)=>({photo:e.photo+(t.photo-e.photo)*n,gamma:e.gamma+(t.gamma-e.gamma)*n,paper:a(e.paper,t.paper,n),light:a(e.light,t.light,n),mid:a(e.mid,t.mid,n),deep:a(e.deep,t.deep,n)}),s=`
uniform vec3 uPaper;
uniform vec3 uLight;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform float uPhoto;   // 0 photographic … 1 photogram
uniform float uGamma;
uniform float uExpo;    // 曝光 -1 … 1
uniform vec4 uFrame;    // brushed area: centre (uv, y up), half size (fraction of the viewport)
uniform float uInset;   // negative inset inside the brushed area, CSS px
uniform float uDev;     // 0 … 1 exposure progress
uniform float uWash;    // rinse front, 0 (top) … 1 (bottom); > 1 = fully washed
uniform float uOx;      // 0 … 1 oxidation (blue deepening)

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
vec4 nrmL(vec2 px) { return textureLod(tNormal, px / uRes, 0.0); }

/* heavy watercolour paper: rounded tooth at two scales + long fibres */
float paperH(vec2 cp) {
  float g = vnoise(cp * 0.3) * 0.5 + vnoise(cp * 0.75 + 7.0) * 0.32 + vnoise(cp * 1.6 + 3.0) * 0.18;
  vec2 r1 = rot(0.5) * cp;
  vec2 r2 = rot(-1.1) * cp;
  float f1 = vnoise(vec2(r1.x * 0.03, r1.y * 1.1));
  float f2 = vnoise(vec2(r2.x * 0.04, r2.y * 1.25) + 11.0);
  return g + smoothstep(0.8, 0.97, max(f1, f2)) * 0.24;
}

vec3 tone(float D) {
  vec3 c = mix(uPaper, uLight, smoothstep(0.0, 0.38, D));
  c = mix(c, uMid, smoothstep(0.3, 0.74, D));
  return mix(c, uDeep, smoothstep(0.68, 1.02, D));
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 res = uRes / uDpr;

  /* ---- brushed coating: ragged stroke ends, bristle streaks, drips */
  vec2 C = uFrame.xy * res;
  vec2 H = uFrame.zw * res;
  vec2 p = cp - C;
  float side = sign(p.x);
  // strokes run horizontally: each stroke (≈40px tall) ends at its own x, bristles drag streaks
  float strokeId = floor((p.y + 4000.0) / 38.0);
  float bristle = vnoise(vec2(p.x * 0.01, p.y * 0.16) + side * 13.0);
  float xEnd = H.x + (hash12(vec2(strokeId, side)) - 0.5) * 34.0 + (bristle - 0.5) * 22.0
             + (vnoise(vec2(p.y * 0.035, side * 7.0)) - 0.5) * 22.0;
  float yEnd = H.y + (vnoise(vec2(p.x * 0.006, sign(p.y) * 5.0)) - 0.5) * 30.0 + (vnoise(vec2(p.x * 0.05, sign(p.y))) - 0.5) * 8.0;
  float ex = xEnd - abs(p.x);   // > 0 inside
  float ey = yEnd - abs(p.y);
  // dry-brush: near the stroke end only the loaded bristles leave pigment
  float dry = smoothstep(0.0, 46.0, ex);
  float bristles = smoothstep(0.42, 0.62, vnoise(vec2(p.x * 0.005, p.y * 0.3) + 3.0) + dry * 0.9);
  float coat = smoothstep(-1.2, 1.2, ex) * mix(bristles, 1.0, dry) * smoothstep(-1.0, 1.0, ey);
  // drips below the bottom edge
  float cell = floor(p.x / 28.0);
  float dr = hash12(vec2(cell, 91.0));
  float dLen = (14.0 + 46.0 * hash12(vec2(cell, 93.0))) * step(0.8, dr);
  float dx = p.x - (cell + 0.5) * 28.0 - (hash12(vec2(cell, 97.0)) - 0.5) * 12.0;
  float below = -(p.y + yEnd);                // > 0 under the bottom edge
  float t = clamp(below / max(dLen, 1.0), 0.0, 1.0);
  float w = (2.0 + 3.0 * hash12(vec2(cell, 99.0))) * (1.0 - 0.45 * t);
  vec2 tip = vec2(dx, below - dLen);
  float drip = max(step(0.0, below) * step(below, dLen) * smoothstep(w + 0.8, w - 0.8, abs(dx)),
                   smoothstep(w * 1.25 + 0.8, w * 1.25 - 0.8, length(tip)));
  drip *= step(0.5, dLen) * step(abs(p.x), xEnd - 8.0);
  coat = max(coat, drip);
  // the brush edge pools sensitiser → denser rim
  float rim = smoothstep(16.0, 2.0, min(ex, ey)) * step(0.0, min(ex, ey));

  /* ---- the negative inside the coating; outside it the coating is fully exposed */
  vec2 N = H - uInset - vec2(10.0, 6.0);
  vec2 qn = abs(p) - N;
  float neg = 1.0 - smoothstep(-2.5, 2.5, max(qn.x, qn.y));

  /* ---- scene: contact-print softness + bleed; coverage for the photogram — one loop */
  vec3 c0 = sceneL(px);
  vec4 n0 = nrmL(px);
  float L0 = luma(c0);
  float Ls = 0.0, Lw = 0.0, cs = 0.0, cw = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854 + 0.2;
    vec2 d = vec2(cos(a), sin(a));
    vec2 o1 = d * 1.5 * uDpr;
    vec2 o2 = rot(0.39) * d * 4.5 * uDpr;
    Ls += luma(sceneL(px + o1));
    Lw += luma(sceneL(px + o2));
    cs += nrmL(px + o1).a;
    cw += nrmL(px + o2).a;
  }
  Ls /= 8.0; Lw /= 8.0; cs /= 8.0; cw /= 8.0;
  float L = mix(L0, Ls, 0.55);
  L = mix(L, min(L, Lw + 0.05), 0.55);          // blue creeps into the whites

  float e = 0.5 + 0.5 * uExpo;
  float Dc = clamp(pow(1.0 - L, mix(1.3, 0.58, e) * uGamma) * mix(0.98, 1.12, e), 0.0, 1.0);

  // photogram: coverage blocks the light; dark / thick parts block more, grazing edges of glass too
  float cov = mix(mix(n0.a, cs, 0.5), cw, 0.3);
  vec3 nv = n0.a > 0.5 ? normalize(n0.rgb * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
  float graze = pow(1.0 - abs(nv.z), 2.0);
  float opaque = mix(0.5, 1.0, smoothstep(0.78, 0.3, L0)) + graze * 0.5;
  float block = cov * clamp(opaque, 0.0, 1.0);
  float leak = (cw - cs) * 0.35;                 // light creeping under lifted edges
  float Dp = clamp(1.0 - block * (1.0 - 0.18 * e) + max(leak, 0.0) + 0.08 * e - 0.04, 0.0, 1.0);

  float D = mix(Dc, Dp, uPhoto);
  D = mix(0.97, D, neg);                         // fully exposed border around the negative

  /* ---- process artefacts on the density */
  float hp = paperH(cp);
  float mott = fbm(cp / 85.0 + 2.0) - 0.5;
  D *= 1.0 + mott * 0.22 + (fbm(cp / 300.0 + 9.0) - 0.5) * 0.16;
  D *= 1.0 + rim * 0.12;
  // water stains: a few dried pools, a touch paler inside with a darker tide line at the rim
  float wf = fbm(cp / 340.0 + 31.0);
  float stain = smoothstep(0.6, 0.625, wf);
  float tideLine = 1.0 - smoothstep(0.0, 0.01, abs(wf - 0.612));
  D *= 1.0 - 0.07 * stain;
  D *= 1.0 + 0.12 * tideLine;
  // rinse streaks running down
  D *= 1.0 - 0.06 * smoothstep(0.62, 0.9, vnoise(vec2(cp.x / 11.0, cp.y / 380.0) + 5.0));
  // the coating skips the paper's valleys → pale speckles in the deep blue
  D *= 1.0 - 0.24 * smoothstep(0.34, 0.2, hp) * smoothstep(0.4, 0.9, D);
  // soft grain
  float gr = (hash12(floor(cp / 1.3) + 0.5) - 0.5) * 0.06 + (vnoise(cp * 0.6) - 0.5) * 0.05;
  D = clamp(D + gr, 0.0, 1.06);

  /* ---- development: sensitiser → exposure → rinse → oxidation */
  float yTop = 1.0 - (cp.y - (C.y - H.y)) / max(2.0 * H.y, 1.0);    // 0 at the top of the coating
  float ripple = (vnoise(vec2(cp.x / 40.0, uTime * 0.8)) - 0.5) * 0.05;
  float washed = 1.0 - smoothstep(uWash - 0.012, uWash + 0.012, yTop + ripple);
  vec3 fresh = tone(D * mix(0.74, 1.0, uOx));
  vec3 sens = vec3(0.86, 0.84, 0.5) * (0.93 + 0.07 * hp);
  vec3 exposing = mix(sens, vec3(0.42, 0.47, 0.44), smoothstep(0.1, 1.0, D) * uDev);
  vec3 ink = mix(exposing, fresh, washed);
  // wet sheen at the rinse front
  float front = exp(-pow((yTop + ripple - uWash) / 0.02, 2.0)) * step(uWash, 1.05);
  ink += front * 0.1;

  vec3 col = mix(uPaper, ink, coat);

  /* ---- paper relief, lit from the upper left; faint fibres on top */
  float hx = paperH(cp + vec2(1.0, 0.0));
  float hy = paperH(cp + vec2(0.0, 1.0));
  col *= 1.0 + ((hp - hx) + (hy - hp)) * 0.085;
  col *= 1.0 - 0.03 * (fbm(cp / 260.0) - 0.5);
  vec2 vu = cp / res - 0.5;
  col *= 1.0 - dot(vu, vu) * 0.12;
  return clamp(col, 0.0, 1.0);
}
`,c=2.6,l=1.9,u=2.8,d=7.3;function f(n={}){let a=n.mode??`classic`,f={from:i[a],to:i[a],cur:i[a],k:1,mode:a,expo:0,expoTarget:0,dev:1/0},p={uPaper:{value:new e},uLight:{value:new e},uMid:{value:new e},uDeep:{value:new e},uPhoto:{value:0},uGamma:{value:1},uExpo:{value:0},uFrame:{value:new t(.5,.5,.455,.435)},uInset:{value:30},uDev:{value:1},uWash:{value:2},uOx:{value:1}},m=e=>{p.uPaper.value.set(...e.paper),p.uLight.value.set(...e.light),p.uMid.value.set(...e.mid),p.uDeep.value.set(...e.deep),p.uPhoto.value=e.photo,p.uGamma.value=e.gamma};m(f.cur);let h=e=>e<.5?2*e*e:1-(-2*e+2)**2/2;return{normals:!0,frag:s,uniforms:p,background:r.background,cy:f,update(e){if(f.k<1&&(f.k=Math.min(1,f.k+e/.8),f.cur=o(f.from,f.to,h(f.k)),m(f.cur)),f.expo+=(f.expoTarget-f.expo)*Math.min(1,e*4),p.uExpo.value=f.expo,f.dev<d){f.dev+=e;let t=f.dev;p.uDev.value=Math.min(1,t/c),p.uWash.value=t<c?-.05:t<4.5?-.05+h((t-c)/l)*1.15:2,p.uOx.value=t<4.5?0:h(Math.min(1,(t-c-l)/u))}else p.uDev.value=1,p.uWash.value=2,p.uOx.value=1}}}function p(e,t){let n=e.cy;n&&n.mode!==t&&(n.mode=t,n.from=n.cur,n.to=i[t],n.k=0)}function m(e,t){let n=e.cy;n&&(n.expoTarget=t)}function h(e,t,n,r,i,a=30){let o=e.uniforms;o&&(o.uFrame.value.set(t,n,r,i),o.uInset.value=a)}function g(e){let t=e.cy;t&&(t.dev=0)}function _(e){let t=e.cy;if(!t||t.dev>=d)return{p:1,stage:3};let n=t.dev;return{p:n/d,stage:n<c?0:n<4.5?1:2}}export{g as a,p as c,_ as i,r as n,m as o,n as r,h as s,f as t};