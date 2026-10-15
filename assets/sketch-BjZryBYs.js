import{O as e,Wt as t,_n as n,dt as r,pt as i}from"./events-9ce18a08.esm-BkDjjFw8.js";var a=[{id:`pencil`,label:`铅笔`,dark:!1},{id:`pen`,label:`钢笔`,dark:!1},{id:`charcoal`,label:`炭笔`,dark:!1},{id:`blueprint`,label:`蓝图`,dark:!0}],o={title:`素描排线`,en:`Pencil Sketch`,background:`#f4f1ea`,theme:`light`},s=e=>{let t=parseInt(e.slice(1),16);return[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255]},c={pencil:{paper:s(`#f4f1ea`),ink:s(`#35332f`),crisp:0,grain:.8,smudge:0,lineW:1,lineK:.92,hatchK:.86,grid:0,wobble:1,double:.75,coarse:1},pen:{paper:s(`#f8f6f0`),ink:s(`#121214`),crisp:1,grain:0,smudge:0,lineW:.85,lineK:1,hatchK:1,grid:0,wobble:.7,double:.45,coarse:.92},charcoal:{paper:s(`#ebe5d9`),ink:s(`#1f1d1b`),crisp:0,grain:1,smudge:1,lineW:1.9,lineK:1,hatchK:.72,grid:0,wobble:1.25,double:.55,coarse:1.35},blueprint:{paper:s(`#1d4c8f`),ink:s(`#eef4ff`),crisp:.55,grain:.15,smudge:0,lineW:.95,lineK:.96,hatchK:.62,grid:1,wobble:.55,double:.3,coarse:1.1}},l=(e,t,n)=>{let r=(e,t)=>e+(t-e)*n,i=(e,t)=>[r(e[0],t[0]),r(e[1],t[1]),r(e[2],t[2])];return{paper:i(e.paper,t.paper),ink:i(e.ink,t.ink),crisp:r(e.crisp,t.crisp),grain:r(e.grain,t.grain),smudge:r(e.smudge,t.smudge),lineW:r(e.lineW,t.lineW),lineK:r(e.lineK,t.lineK),hatchK:r(e.hatchK,t.hatchK),grid:r(e.grid,t.grid),wobble:r(e.wobble,t.wobble),double:r(e.double,t.double),coarse:r(e.coarse,t.coarse)}},u=1024,d=null;function f(e){return()=>{e|=0,e=e+1831565813|0;let t=Math.imul(e^e>>>15,1|e);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}function p(){if(d)return d;let n=document.createElement(`canvas`);n.width=n.height=u;let a=n.getContext(`2d`);a.fillStyle=`#000`,a.fillRect(0,0,u,u),a.globalCompositeOperation=`lighter`;let o=f(1977),s=u/96,c=(e,t,n,r)=>{let i=(o()-.5)*.035,s=(o()-.5)*3.2,c=1.5+o()*1.7,l=.5+o()*.5,d=Math.max(6,Math.round(n/7)),f=[],p=0;for(let e=0;e<=d;e++)p=p*.8+(o()-.5)*.5,f.push(p);let m=[],h=[];for(let r=0;r<=d;r++){let a=r/d,o=e+a*n,l=t+i*a*n+s*(4*a*(1-a)),u=Math.sin(Math.PI*Math.min(1,Math.max(0,a)))**.45,p=Math.max(.35,c*(.35+.65*u)*(1+f[r]));m.push([o,l-p/2]),h.push([o,l+p/2])}let g=a.createLinearGradient(e,0,e+n,0),_=e=>`rgba(${r},${Math.max(0,Math.min(1,l*e)).toFixed(3)})`;g.addColorStop(0,_(0)),g.addColorStop(.06+o()*.08,_(.9));let v=o()<.55?1+Math.floor(o()*2):0,y=[];for(let e=0;e<v;e++)y.push(.25+o()*.5);y.sort((e,t)=>e-t);for(let e of y)g.addColorStop(e-.03,_(.85+o()*.15)),g.addColorStop(e,_(.08+o()*.2)),g.addColorStop(e+.03,_(.8+o()*.2));g.addColorStop(.82+o()*.08,_(.7+o()*.3)),g.addColorStop(1,_(0)),a.fillStyle=g;let b=[0,...e+n>u?[-1024]:[],...e<0?[u]:[]],x=[0,...t>1016?[-1024]:[],...t<8?[u]:[]];for(let e of b)for(let t of x){a.save(),a.translate(e,t),a.beginPath(),a.moveTo(m[0][0],m[0][1]);for(let e of m)a.lineTo(e[0],e[1]);for(let e=h.length-1;e>=0;e--)a.lineTo(h[e][0],h[e][1]);a.closePath(),a.fill(),a.restore()}};for(let e=0;e<2;e++){let t=e===0?`255,0,0`:`0,255,0`;for(let n=0;n<96;n++){let r=(n+(e?.5:0)+(o()-.5)*.3)*s,i=o()*u,a=i+u;for(;i<a-30;){let e=Math.min(70+o()*250,a-i);c(i%u,r,e,t),i+=e+(o()<.3?-10-o()*20:6+o()*34)}}}let l=new e(n);return l.colorSpace=``,l.wrapS=l.wrapT=t,l.minFilter=i,l.magFilter=r,l.generateMipmaps=!0,l.anisotropy=4,l.needsUpdate=!0,d=l,l}var m=`
uniform sampler2D tStroke;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform float uCrisp;
uniform float uGrain;
uniform float uSmudge;
uniform float uLineW;
uniform float uLineK;
uniform float uHatchK;
uniform float uGrid;
uniform float uWobble;
uniform float uDouble;
uniform float uDensity;   // 1 = default stroke spacing
uniform float uSeed;      // boil frame

#define TEXN ${u.toFixed(1)}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// one hatch direction → ink of the two interleaved stroke sets (R, G)
vec2 hatchDir(vec2 cp, float ang, float texPerCss, float layer) {
  mat2 R = rot(ang);
  vec2 q = R * cp * texPerCss;                       // texture px, u along the strokes
  vec2 dx = R * vec2(texPerCss / uDpr, 0.0) / TEXN;  // analytic derivatives (cp = px / uDpr)
  vec2 dy = R * vec2(0.0, texPerCss / uDpr) / TEXN;
  const float TU = 230.0;
  const float TV = 150.0;
  float row = floor(q.y / TV);
  float hr = hash12(vec2(row * 1.31, layer * 17.0 + uSeed * 3.1));
  float u = q.x / TU + hr;
  vec2 res = vec2(0.0);
  for (int g = 0; g < 2; g++) {
    float ug = u + float(g) * 0.5;
    float col = floor(ug);
    float fu = fract(ug);
    float w = smoothstep(0.0, 0.24, fu) * smoothstep(1.0, 0.76, fu);
    vec2 h = vec2(hash12(vec2(col, row) + layer * 31.7 + uSeed * 7.13),
                  hash12(vec2(row, col) * 1.7 + layer * 13.1 + uSeed * 3.71));
    float r = (hash12(vec2(col * 3.1, row) + uSeed + layer) - 0.5) * 0.1;
    vec2 centre = vec2((col - float(g) * 0.5 - hr + 0.5) * TU, (row + 0.5) * TV);
    vec2 t = rot(r) * (q - centre) + h * TEXN;
    vec2 s = textureGrad(tStroke, t / TEXN, dx, dy).rg;
    res = max(res, s * w);
  }
  return res;
}

float ramp(float t, float a, float b) { return smoothstep(a, b, t); }

float layerInk(vec2 s, float t, float a0, float a1, float b0, float b1) {
  float press = 0.62 + 0.45 * t;                 // darker tone → harder pressure
  vec2 v = s * vec2(ramp(t, a0, a1), ramp(t, b0, b1)) * press;
  v = mix(v, smoothstep(0.2, 0.42, v), uCrisp);  // ink: hard-edged strokes that thin out instead of fading
  return max(v.x, v.y);
}

float hatching(vec2 cp, float t) {
  float k = 2.0 * uDensity;                      // texture px per CSS px (rows ≈ 5.3 CSS px apart)
  float ink = 0.0;
  if (t < 0.05) return 0.0;
  float a = 0.94 + (hash12(vec2(uSeed, 3.0)) - 0.5) * 0.04;
  ink = layerInk(hatchDir(cp, a, k, 1.0), t, 0.07, 0.21, 0.18, 0.32);
  if (t > 0.3) ink = 1.0 - (1.0 - ink) * (1.0 - layerInk(hatchDir(cp, a - 1.62, k, 2.0), t, 0.3, 0.44, 0.42, 0.55));
  if (t > 0.53) ink = 1.0 - (1.0 - ink) * (1.0 - layerInk(hatchDir(cp, a - 0.78, k * 1.05, 3.0), t, 0.53, 0.65, 0.63, 0.74));
  if (t > 0.72) ink = 1.0 - (1.0 - ink) * (1.0 - layerInk(hatchDir(cp, a + 0.42, k * 1.45, 4.0), t, 0.72, 0.84, 0.82, 0.94));
  return ink;
}

// depth Laplacian (jumps, not slopes) + normal Sobel (creases); r = sample radius in device px
float edgeAt(vec2 p, float r) {
  float d0 = depthAt(p);
  float d1 = depthAt(p + vec2(r, 0.0));
  float d2 = depthAt(p - vec2(r, 0.0));
  float d3 = depthAt(p + vec2(0.0, r));
  float d4 = depthAt(p - vec2(0.0, r));
  float lap = abs(d1 + d2 + d3 + d4 - 4.0 * d0) / max(min(min(d1, d2), min(min(d3, d4), d0)), 1e-3);
  vec3 n00 = normalAt(p + vec2(-r, -r));
  vec3 n10 = normalAt(p + vec2(0.0, -r));
  vec3 n20 = normalAt(p + vec2(r, -r));
  vec3 n01 = normalAt(p + vec2(-r, 0.0));
  vec3 n21 = normalAt(p + vec2(r, 0.0));
  vec3 n02 = normalAt(p + vec2(-r, r));
  vec3 n12 = normalAt(p + vec2(0.0, r));
  vec3 n22 = normalAt(p + vec2(r, r));
  vec3 gx = (n20 + 2.0 * n21 + n22) - (n00 + 2.0 * n01 + n02);
  vec3 gy = (n02 + 2.0 * n12 + n22) - (n00 + 2.0 * n10 + n20);
  float en = sqrt(dot(gx, gx) + dot(gy, gy));
  return max(smoothstep(0.018, 0.05, lap), smoothstep(0.9, 1.7, en));
}

float contour(vec2 px, vec2 cp) {
  float r = max(uLineW * uDpr, 0.75);
  float s = uSeed;
  vec2 j = (vec2(vnoise(cp * 0.045 + s * 1.37), vnoise(cp * 0.045 + vec2(19.1, 3.3) + s * 2.11)) - 0.5) * 3.8;
  j += (vec2(vnoise(cp * 0.22 + s * 5.3), vnoise(cp * 0.22 + vec2(7.7, 1.9) - s * 3.1)) - 0.5) * 1.0;
  j *= uWobble * uDpr;
  float e = edgeAt(px + j, r);
  float press = 0.62 + 0.38 * vnoise(cp * 0.03 + s * 0.77 + 40.0);
  float lift = smoothstep(0.08, 0.22, vnoise(cp * 0.055 + s * 2.9 + 9.0));
  float l = e * press * mix(1.0, lift, 0.85);
  if (uDouble > 0.01) {
    // occasional second, displaced pass: reads as a doubled stroke across a line, an overshoot along it
    float gate = smoothstep(0.48, 0.7, vnoise(cp * 0.012 + s * 0.93 + 70.0));
    if (gate > 0.0) {
      vec2 dir = rot(vnoise(cp * 0.008 + s * 0.5) * 12.0) * vec2(1.0, 0.0);
      vec2 j2 = -0.7 * j + dir * 3.4 * uDpr;
      float e2 = edgeAt(px + j2, r * 0.8) * (0.4 + 0.35 * vnoise(cp * 0.05 + s + 3.0));
      l = max(l, e2 * gate * uDouble);
    }
  }
  return l;
}

float gridLine(vec2 p, float stepPx, float w) {
  vec2 d = abs(mod(p + stepPx * 0.5, stepPx) - stepPx * 0.5);
  float m = min(d.x, d.y);
  float aa = 0.6 / uDpr;
  return 1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, m);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec3 sc = sceneAt(px);
  float t = clamp((0.93 - luma(sc)) / 0.82, 0.0, 1.0);

  float hInk = hatching(cp, t) * uHatchK;

  float lInk = contour(px, cp) * uLineK;
  lInk = mix(lInk, smoothstep(0.22, 0.45, lInk), uCrisp);

  // charcoal: rubbed-in tone from a blurred copy of the scene
  float sm = 0.0;
  if (uSmudge > 0.01) {
    float acc = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785 + 0.3;
      acc += luma(sceneAt(px + vec2(cos(a), sin(a)) * 7.0 * uDpr));
      acc += 0.5 * luma(sceneAt(px + vec2(cos(a + 0.39), sin(a + 0.39)) * 15.0 * uDpr));
    }
    float tb = clamp((0.95 - acc / 12.0) / 0.84, 0.0, 1.0);
    sm = smoothstep(0.08, 0.9, tb) * (0.7 + 0.3 * vnoise(cp * 0.017 + 3.0)) * 0.78 * uSmudge;
  }

  float ink = 1.0 - (1.0 - hInk) * (1.0 - lInk) * (1.0 - sm);

  // paper tooth: soft media only catches the grain peaks unless pressed hard
  float tooth = 0.55 * vnoise(cp * vec2(0.85, 1.25)) + 0.45 * hash12(floor(cp * 1.4));
  float catchK = smoothstep(0.12, 0.85, tooth + ink * 0.75 - 0.32);
  ink *= mix(1.0, catchK, uGrain);

  vec2 gc = cp - uRes / uDpr * 0.5;
  float grid = max(gridLine(gc, 14.0, 0.7) * 0.13, gridLine(gc, 70.0, 1.2) * 0.3) * uGrid;

  float fib = vnoise(cp * 0.0035) - 0.5;
  vec3 paper = uPaper * (1.0 - 0.04 * fib - 0.03 * (hash12(floor(cp * 1.5)) - 0.5) * (0.3 + uGrain));
  paper = mix(paper, uInk, grid);
  return mix(paper, uInk, clamp(ink, 0.0, 1.0));
}
`;function h(){let e={from:c.pencil,to:c.pencil,cur:c.pencil,k:1,density:1,densityTarget:1,boil:!0,t:0,mode:`pencil`},t=e=>new n(...e),r={tStroke:{value:p()},uPaper:{value:t(c.pencil.paper)},uInk:{value:t(c.pencil.ink)},uCrisp:{value:0},uGrain:{value:0},uSmudge:{value:0},uLineW:{value:1},uLineK:{value:1},uHatchK:{value:1},uGrid:{value:0},uWobble:{value:1},uDouble:{value:0},uDensity:{value:1},uSeed:{value:0}},i=t=>{r.uPaper.value.set(...t.paper),r.uInk.value.set(...t.ink),r.uCrisp.value=t.crisp,r.uGrain.value=t.grain,r.uSmudge.value=t.smudge,r.uLineW.value=t.lineW,r.uLineK.value=t.lineK,r.uHatchK.value=t.hatchK,r.uGrid.value=t.grid,r.uWobble.value=t.wobble,r.uDouble.value=t.double,r.uDensity.value=e.density/t.coarse};return i(e.cur),{normals:!0,frag:m,uniforms:r,sketch:e,update(t){if(e.t+=t,e.boil&&(r.uSeed.value=Math.floor(e.t*8)%997),e.k<1){e.k=Math.min(1,e.k+t/.75);let n=e.k<.5?4*e.k**3:1-(-2*e.k+2)**3/2;e.cur=l(e.from,e.to,n)}e.density+=(e.densityTarget-e.density)*Math.min(1,t*6),i(e.cur)}}}function g(e,t){let n=e.sketch;n&&n.mode!==t&&(n.mode=t,n.from=n.cur,n.to=c[t],n.k=0)}function _(e,t){let n=e.sketch;n&&(n.densityTarget=t)}function v(e,t){let n=e.sketch;n&&(n.boil=t)}export{o as a,g as i,v as n,a as o,_ as r,h as t};