import{_n as e,vn as t}from"./events-9ce18a08.esm-BkDjjFw8.js";var n=[{id:`brick`,label:`积木`},{id:`flatpack`,label:`家具`},{id:`exploded`,label:`爆炸图`}],r={title:`说明书线图`,en:`Instruction Manual`,background:`#f7f6f2`,theme:`light`},i=e=>{let t=parseInt(e.slice(1),16);return[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255]},a={brick:{lineW:2.3,creaseW:1.15,color:1,pale:0,sat:1.15,shadowK:.74,hi:1,gloss:1,panel:1,grid:0,ink:i(`#17171a`),tint:i(`#eef0ff`),panelCol:i(`#e2e8ef`)},flatpack:{lineW:2,creaseW:1,color:0,pale:0,sat:1,shadowK:.82,hi:.6,gloss:0,panel:0,grid:0,ink:i(`#111111`),tint:i(`#ffffff`),panelCol:i(`#eeeeec`)},exploded:{lineW:1.7,creaseW:.9,color:1,pale:.9,sat:.3,shadowK:.86,hi:.4,gloss:0,panel:0,grid:1,ink:i(`#1d3c74`),tint:i(`#d6e4fa`),panelCol:i(`#eef3fb`)}},o={lineW:`uLineW`,creaseW:`uCreaseW`,color:`uColor`,pale:`uPale`,sat:`uSat`,shadowK:`uShadowK`,hi:`uHi`,gloss:`uGloss`,panel:`uPanel`,grid:`uGrid`,ink:`uInk`,tint:`uTint`,panelCol:`uPanelCol`},s=`
uniform float uLineW;
uniform float uCreaseW;
uniform float uLineScale;
uniform float uColor;
uniform float uPale;
uniform float uSat;
uniform float uShadowK;
uniform float uHi;
uniform float uGloss;
uniform float uPanel;
uniform float uGrid;
uniform vec3 uInk;
uniform vec3 uTint;
uniform vec3 uPanelCol;
uniform vec3 uPaper;
uniform vec4 uPanelRect;   // CSS px, top-left origin: x, y, w, h (w <= 0 → auto)

const vec3 ILL = vec3(-0.5, 0.68, 0.54);

vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float rawD(vec2 px) { return textureLod(tDepth, px / uRes, 0.0).r; }
vec4 nrmL(vec2 px) { return textureLod(tNormal, px / uRes, 0.0); }
float izOf(float d) {
  if (uOrtho > 0.5) return 1.0 / (uNear + d * (uFar - uNear));
  float z = d * 2.0 - 1.0;
  return (uFar + uNear - z * (uFar - uNear)) / (2.0 * uNear * uFar);
}

// 2 = silhouette / occluding edge, 1 = crease, 0 = none
int edgeAt(vec2 q, vec2 px, float cov0, float iz0, vec2 grad, vec3 n0) {
  float d = rawD(q);
  float c = step(d, 0.99999);
  if (c != cov0) return 2;
  if (cov0 < 0.5) return 0;
  float iz = izOf(d);
  if (abs(iz - (iz0 + dot(grad, q - px))) > 0.004 * iz0) return 2;
  vec3 n = nrmL(q).xyz * 2.0 - 1.0;
  if (dot(n, n0) < 0.76 * length(n)) return 1;
  return 0;
}

vec3 chromaOf(vec3 c) { return c / (max(max(c.r, c.g), c.b) + 1e-3); }

float roundRect(vec2 p, vec2 c, vec2 h, float r) {
  vec2 q = abs(p - c) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 resC = uRes / uDpr;
  vec2 cpT = vec2(cp.x, resC.y - cp.y); // top-left origin, CSS px

  /* centre */
  float d0 = rawD(px);
  float cov0 = step(d0, 0.99999);
  float iz0 = izOf(d0);
  vec3 n0 = normalize(nrmL(px).xyz * 2.0 - 1.0);
  vec2 grad = vec2(0.0);
  if (cov0 > 0.5) {
    float r = izOf(rawD(px + vec2(1.0, 0.0))), l = izOf(rawD(px - vec2(1.0, 0.0)));
    float u = izOf(rawD(px + vec2(0.0, 1.0))), b = izOf(rawD(px - vec2(0.0, 1.0)));
    grad.x = abs(r - iz0) < abs(iz0 - l) ? r - iz0 : iz0 - l;
    grad.y = abs(u - iz0) < abs(iz0 - b) ? u - iz0 : iz0 - b;
  }

  /* distance to the nearest silhouette / crease (8 rays × 4 steps) */
  float Ws = 0.5 * uLineW * uLineScale * uDpr;
  float Wc = 0.5 * uCreaseW * uLineScale * uDpr;
  float aa = 0.65 * uDpr;
  float R = Ws + aa + 1.6 * uDpr;
  float dSil = 1e5;
  float dCr = 1e5;
  vec2 dirHit = vec2(0.0);
  float dHit = 1e5;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982 + 0.3927;
    vec2 dir = vec2(cos(a), sin(a));
    float lo = 0.0;
    float hi = 0.0;
    int hit = 0;
    for (int k = 1; k <= 4; k++) {
      float r = R * float(k) / 4.0;
      int e = edgeAt(px + dir * r, px, cov0, iz0, grad, n0);
      if (e > 0) { hi = r; hit = e; break; }
      lo = r;
    }
    if (hit > 0) {
      // refine where the edge is (two bisection steps) so line sides and the hairline are smooth
      for (int b = 0; b < 2; b++) {
        float m = 0.5 * (lo + hi);
        if (edgeAt(px + dir * m, px, cov0, iz0, grad, n0) > 0) hi = m; else lo = m;
      }
      float dd = 0.5 * (lo + hi);
      if (hit == 2) dSil = min(dSil, dd); else dCr = min(dCr, dd);
      if (dd < dHit) { dHit = dd; dirHit = dir; }
    }
  }
  float line = max(smoothstep(Ws + aa, Ws - aa, dSil), smoothstep(Wc + aa, Wc - aa, dCr));

  /* fill colour, flat: hue at a fixed paint value for colours, the nearest plastic grey for neutrals */
  vec3 c0 = sceneL(px);
  float V = max(max(c0.r, c0.g), c0.b);
  float S = (V - min(min(c0.r, c0.g), c0.b)) / max(V, 1e-3);
  vec3 hue = chromaOf(c0);
  vec3 paint = hue * mix(0.9, 0.95, smoothstep(0.5, 0.2, S));
  // neutral greys: black · dark grey · light grey · white (crisp steps, so a lit gradient never smears)
  float g1 = smoothstep(0.27, 0.3, V);
  float g2 = smoothstep(0.54, 0.57, V);
  float g3 = smoothstep(0.8, 0.83, V);
  float gv = mix(mix(mix(0.17, 0.43, g1), 0.7, g2), 0.96, g3);
  vec3 neutral = vec3(gv) * mix(vec3(1.0), hue, 0.35);
  vec3 alb = mix(neutral, paint, smoothstep(0.16, 0.3, S));
  alb = clamp(mix(vec3(dot(alb, vec3(0.3, 0.59, 0.11))), alb, uSat), 0.0, 1.0);
  // IKEA: grey only (dark parts become a light grey, everything else white)
  vec3 grey = vec3(mix(0.78, 0.985, smoothstep(0.24, 0.27, dot(alb, vec3(0.3, 0.59, 0.11)))));
  vec3 base = mix(grey, alb, uColor);
  base = mix(base, uPaper * uTint, uPale);

  /* two tones from the illustrator's light */
  float ndl = dot(n0, normalize(ILL));
  float lit = smoothstep(0.08, 0.14, ndl);
  vec3 shadowC = base * uShadowK * mix(vec3(1.0), vec3(0.93, 0.95, 1.04), uColor * (1.0 - uPale));
  vec3 fill = mix(shadowC, base, lit);

  // crisp edge hairline just inside upper-left outlines of lit faces
  float inner = min(dSil - Ws, dCr - Wc);
  float band = smoothstep(0.35 * uDpr, 0.75 * uDpr, inner) * (1.0 - smoothstep(1.5 * uDpr, 1.9 * uDpr, inner));
  float upLeft = smoothstep(0.1, 0.5, dot(dirHit, normalize(vec2(-1.0, 1.0))));
  fill = mix(fill, mix(vec3(1.0), uPaper, uPale * 0.5), band * upLeft * lit * uHi * 0.85);

  // LEGO: crisp gloss on curved plastic
  vec3 Rv = reflect(-normalize(vec3(-0.35, 0.55, 0.76)), n0);
  float sp = smoothstep(0.955, 0.965, Rv.z);
  fill = mix(fill, vec3(1.0), sp * uGloss * 0.9);

  /* ground */
  float n = hash12(floor(cp * 0.75)) - 0.5;
  vec3 paper = uPaper * (1.0 + n * 0.012);
  vec4 pr = uPanelRect;
  if (pr.z <= 0.0) pr = vec4(resC.x * 0.05, resC.y * 0.06, resC.x * 0.9, resC.y * 0.88);
  float pd = roundRect(cpT, pr.xy + pr.zw * 0.5, pr.zw * 0.5, 18.0);
  vec3 panelC = mix(uPanelCol * (1.0 + n * 0.008), uPanelCol * 0.985, smoothstep(0.0, 1.0, cpT.y / resC.y));
  vec3 ground = mix(paper, panelC, smoothstep(0.7, -0.7, pd) * uPanel);
  // exploded view: faint engineering grid
  vec2 g = abs(fract(cp / 24.0 + 0.5) - 0.5) * 24.0;
  vec2 G = abs(fract(cp / 120.0 + 0.5) - 0.5) * 120.0;
  float gl = max(1.0 - smoothstep(0.3, 0.9, min(g.x, g.y)), 1.6 * (1.0 - smoothstep(0.4, 1.1, min(G.x, G.y))));
  ground = mix(ground, uInk, gl * 0.07 * uGrid);

  vec3 col = mix(ground, fill, cov0);
  col = mix(col, uInk, line);
  return col;
}
`,c=new WeakMap,l=e=>e<.5?4*e*e*e:1-(-2*e+2)**3/2,u=e=>Array.isArray(e);function d(n={}){let d=n.mode??`brick`,f=a[d],p={uLineScale:{value:1},uPaper:{value:new e(...i(`#fbfaf7`))},uPanelRect:{value:new t(0,0,0,0)}};for(let t of Object.keys(o)){let n=f[t];p[o[t]]={value:u(n)?new e(...n):n}}let m={mode:d,from:f,to:f,k:1},h={normals:!0,frag:s,uniforms:p,background:r.background,update(e){if(m.k>=1)return;m.k=Math.min(1,m.k+e/.6);let t=l(m.k);for(let e of Object.keys(o)){let n=m.from[e],r=m.to[e],i=p[o[e]];u(n)&&u(r)?i.value.set(n[0]+(r[0]-n[0])*t,n[1]+(r[1]-n[1])*t,n[2]+(r[2]-n[2])*t):i.value=n+(r-n)*t}}};return c.set(h,m),h}function f(t,n){let r=c.get(t);if(!r||r.mode===n)return;let i=t.uniforms,s={};for(let t of Object.keys(o)){let n=i[o[t]].value;s[t]=n instanceof e?[n.x,n.y,n.z]:n}r.from=s,r.to=a[n],r.mode=n,r.k=0}function p(e,t){e.uniforms.uLineScale.value=t}function m(e,t){let n=e.uniforms.uPanelRect.value;t?n.set(t.x,t.y,t.w,t.h):n.set(0,0,0,0)}export{f as a,p as i,r as n,m as o,n as r,d as t};