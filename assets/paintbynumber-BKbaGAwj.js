import{$ as e,Bt as t,O as n,dt as r,kt as i,pt as a,vn as o,z as s}from"./events-9ce18a08.esm-BkDjjFw8.js";var c=[{id:`fill`,label:`填色中`,en:`Painting`},{id:`done`,label:`完成`,en:`Finished`},{id:`lines`,label:`线稿`,en:`Line art`}],l=[12,16,20],u={title:`数字填色`,en:`Paint by Number`,background:`#ffffff`,theme:`light`},d={white:{hex:`#fbf9f3`,zh:`钛白`},cream:{hex:`#f1dfb4`,zh:`米黄`},yellow:{hex:`#f5c534`,zh:`柠檬黄`},orange:{hex:`#ee8f33`,zh:`橘黄`},vermilion:{hex:`#de4a35`,zh:`朱红`},crimson:{hex:`#a8232e`,zh:`深红`},maroon:{hex:`#5e1a24`,zh:`酱紫`},pink:{hex:`#f0a0b2`,zh:`粉红`},violet:{hex:`#8a5cc0`,zh:`紫罗兰`},indigo:{hex:`#3e3a8a`,zh:`靛蓝`},blue:{hex:`#2c63c9`,zh:`群青`},sky:{hex:`#86c3ea`,zh:`天蓝`},teal:{hex:`#1fa092`,zh:`青绿`},lime:{hex:`#a9d36a`,zh:`嫩绿`},green:{hex:`#479b45`,zh:`草绿`},forest:{hex:`#22593a`,zh:`墨绿`},tan:{hex:`#c58f5c`,zh:`土黄`},brown:{hex:`#6a4631`,zh:`熟褐`},grey:{hex:`#a29c92`,zh:`暖灰`},charcoal:{hex:`#2b2b33`,zh:`炭黑`}},f={12:[`white`,`cream`,`yellow`,`orange`,`vermilion`,`crimson`,`violet`,`blue`,`sky`,`green`,`brown`,`grey`].map(e=>d[e]),16:[`white`,`cream`,`yellow`,`orange`,`vermilion`,`crimson`,`pink`,`violet`,`blue`,`sky`,`teal`,`green`,`forest`,`brown`,`grey`,`charcoal`].map(e=>d[e]),20:[`white`,`cream`,`yellow`,`orange`,`vermilion`,`crimson`,`maroon`,`pink`,`violet`,`indigo`,`blue`,`sky`,`teal`,`lime`,`green`,`forest`,`tan`,`brown`,`grey`,`charcoal`].map(e=>d[e])},p=32,m=e=>Math.min(.3,3.2/e),h=e=>{let t=parseInt(e.slice(1),16);return[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255]},g=e=>e<=.04045?e/12.92:((e+.055)/1.055)**2.4;function _(e){let[t,n,r]=h(e).map(g),i=Math.cbrt(.4122214708*t+.5363325363*n+.0514459929*r),a=Math.cbrt(.2119034982*t+.6806995451*n+.1073969566*r),o=Math.cbrt(.0883024619*t+.2817188376*n+.6299787005*r);return[.2104542553*i+.793617785*a-.0040720468*o,1.9779984951*i-2.428592205*a+.4505937099*o,.0259040371*i+.7827717662*a-.808675766*o]}var v=null;function y(){if(v)return v;let e=document.createElement(`canvas`);e.width=640,e.height=80;let t=e.getContext(`2d`);t.fillStyle=`#fff`,t.textAlign=`center`,t.textBaseline=`middle`,t.font=`600 66px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;for(let e=0;e<10;e++)t.fillText(String(e),64*e+32,43);return v=e,e}var b=`
uniform sampler2D tPal;    // ${p}×2 float: row 0 sRGB, row 1 Oklab
uniform sampler2D tGlyph;  // digits 0–9, 10 cells of 64×80
uniform int uN;            // pots in the kit
uniform float uProg;       // 0..1 painting progress
uniform float uWin;        // a pot's window (fraction of the run)
uniform float uWash;       // paint visibility (0 = bare printed canvas)
uniform vec4 uLook;        // line ghost under paint, label amount, brush texture, line amount
uniform float uGrid;       // label grid, CSS px
uniform float uKeep;       // fraction of big-region cells that keep their number

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 oklabOf(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0);
  m = pow(max(m, 0.0), 1.0 / 3.0);
  s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
              1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
              0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
}

// the region (pot index) at a device-px position: nearest paint in Oklab
int potAt(vec2 p) {
  vec3 c = textureLod(tScene, clamp(p, vec2(0.5), uRes - 0.5) / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  vec3 lab = oklabOf(clamp(c, 0.0, 1.0));
  float best = 1e9;
  int bi = 0;
  for (int i = 0; i < uN; i++) {
    vec3 d = lab - texelFetch(tPal, ivec2(i, 1), 0).rgb;
    d.yz *= 1.15;
    float e = dot(d, d);
    if (e < best) { best = e; bi = i; }
  }
  return bi;
}

// how far the pot's paint has come at this pixel (0 bare … 1 painted)
float paintedAt(int i, vec2 uv, vec2 cp) {
  float st = float(i) / float(uN) * (1.0 - uWin);
  float t = clamp((uProg - st) / uWin, 0.0, 1.0);
  if (t <= 0.0) return 0.0;
  if (t >= 1.0) return 1.0;
  // the brush crosses the canvas in streaky strokes, a little differently for each pot
  float h = float(i) * 0.6180339;
  float ang = 0.35 + 0.5 * sin(h * 6.283);
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 r = vec2(dot(cp, dir), dot(cp, vec2(-dir.y, dir.x)));
  float streak = vnoise(r * vec2(0.012, 0.16) + h * 31.0) * 0.6 + vnoise(r * vec2(0.03, 0.5) + h * 7.0) * 0.4;
  float front = mix(uv.x, 1.0 - uv.y, 0.3 + 0.4 * fract(h * 3.0));
  front = 0.06 + 0.82 * clamp(front + (streak - 0.5) * 0.22 + (vnoise(cp * 0.006 + h) - 0.5) * 0.2, 0.0, 1.0);
  return smoothstep(front - 0.012, front + 0.012, t);
}

vec3 stylize(vec2 px) {
  float S = uDpr;
  vec2 uv = px / uRes;
  vec2 cp = px / S;

  // label cell: a staggered grid, one jittered candidate point per cell
  float G = uGrid;
  float row = floor(cp.y / G);
  float sh = mod(row, 2.0) * 0.5;
  vec2 cell = vec2(floor(cp.x / G + sh), row);
  vec2 lc = (cell + vec2(0.5 - sh, 0.5)) * G + (vec2(hash12(cell + 3.1), hash12(cell + 8.7)) - 0.5) * G * 0.42;
  float gh = 10.0;                      // digit height, CSS px
  vec2 lr = cp - lc;
  bool inBox = abs(lr.x) < gh * 0.72 && abs(lr.y) < gh * 0.62 && uLook.y > 0.001;

  // every snap goes through this loop: centre · 4 border taps · paint jitter · label point · 2 probe rings
  vec2 jit = vec2(vnoise(cp * 0.16) - 0.5, vnoise(cp * 0.16 + 17.0) - 0.5) * 2.6 + vec2(vnoise(cp * 0.6 + 5.0) - 0.5) * 0.8;
  int idx = 0, paintI = 0, labI = -1, q1 = 0, q2 = 0, q3 = 0;
  float border = 0.0;
  bool label = inBox;
  bool big = true;
  int K = inBox ? 19 : 6;
  for (int k = 0; k < K; k++) {
    vec2 sp;
    if (k == 0) sp = cp;
    else if (k < 5) {
      float a = float(k - 1) * 1.5707963;
      sp = cp + vec2(cos(a), sin(a)) * 1.1;
    } else if (k == 5) sp = cp + jit;
    else if (k == 6) sp = lc;
    else {
      float j = float(k < 13 ? k - 7 : k - 13);
      float a = j * 1.0471976 + (k < 13 ? 0.0 : 0.52);
      sp = lc + vec2(cos(a), sin(a)) * (k < 13 ? 10.0 : 30.0);
    }
    int q = potAt(sp * S);
    if (k == 0) idx = q;
    else if (k < 5) {
      if (k == 1) q1 = q;
      else if (k == 2) q2 = q;
      else if (k == 3) q3 = q;
      else {
        // a sliver thinner than ~2 px between two regions (an anti-aliased edge passing through a third
        // paint) is given to its neighbour, so outlines stay single
        if (q1 != idx && q3 != idx) idx = q1;
        else if (q2 != idx && q != idx) idx = q2;
        border = float(q1 != idx) + float(q2 != idx) + float(q3 != idx) + float(q != idx);
      }
    } else if (k == 5) paintI = q;
    else if (k == 6) {
      labI = q;
      if (q != idx) { label = false; break; }
    } else if (k < 13) {
      if (q != labI) { label = false; break; }
    } else if (q != labI) {
      big = false;
      break;
    }
  }
  if (big && label && hash12(cell * 1.31 + 0.7) > uKeep) label = false;

  // canvas: primed linen
  vec3 canvasC = vec3(0.985, 0.979, 0.962);
  float weave = sin(cp.x * 2.3) * sin(cp.y * 2.3);
  canvasC *= 0.99 + 0.012 * weave + 0.02 * (vnoise(cp * 0.05) - 0.5);
  vec3 col = canvasC;

  // printed lines and numbers
  vec3 ink = vec3(0.45, 0.53, 0.66);
  float line = clamp(border * 0.4, 0.0, 0.8) * uLook.w;
  col = mix(col, ink, line * 0.85);
  float digits = 0.0;
  if (label && labI >= 0) {
    int num = labI + 1;
    int d0 = num / 10;
    int d1 = num - d0 * 10;
    float adv = gh * 0.6;
    float cw = gh * 0.8;               // atlas cell width in CSS px (64:80)
    float lod = log2(80.0 / (gh * S));
    vec2 lp = lr;                      // CanvasTexture is flipped: atlas v runs up, like cp
    float a = 0.0;
    if (d0 == 0) {
      vec2 g = lp / vec2(cw, gh) + 0.5;
      if (g.x > 0.0 && g.x < 1.0 && g.y > 0.0 && g.y < 1.0)
        a = textureLod(tGlyph, vec2((float(d1) + g.x) / 10.0, g.y), lod).a;
    } else {
      vec2 g0 = (lp + vec2(adv * 0.5, 0.0)) / vec2(cw, gh) + 0.5;
      vec2 g1 = (lp - vec2(adv * 0.5, 0.0)) / vec2(cw, gh) + 0.5;
      float a0 = 0.0, a1 = 0.0;
      if (g0.x > 0.0 && g0.x < 1.0 && g0.y > 0.0 && g0.y < 1.0)
        a0 = textureLod(tGlyph, vec2((float(d0) + g0.x) / 10.0, g0.y), lod).a;
      if (g1.x > 0.0 && g1.x < 1.0 && g1.y > 0.0 && g1.y < 1.0)
        a1 = textureLod(tGlyph, vec2((float(d1) + g1.x) / 10.0, g1.y), lod).a;
      a = max(a0, a1);
    }
    digits = a * uLook.y;
    col = mix(col, ink * 0.8, digits);
  }

  // paint
  float pk = paintedAt(paintI, uv, cp) * uWash;
  if (pk > 0.001) {
    vec3 pc = texelFetch(tPal, ivec2(paintI, 0), 0).rgb;
    // flat acrylic: soft brush streaks, a little impasto, darker where it pools against a border
    float h = float(paintI) * 0.6180339;
    float ang = 0.35 + 0.5 * sin(h * 6.283);
    vec2 dir = vec2(cos(ang), sin(ang));
    // strokes follow one direction per pot; a gentle warp bends them (warping the domain, not the angle,
    // so far from the origin nothing swirls)
    vec2 wp = cp + (vec2(vnoise(cp * 0.012 + h), vnoise(cp * 0.012 + h + 5.0)) - 0.5) * 26.0;
    vec2 r = vec2(dot(wp, dir), dot(wp, vec2(-dir.y, dir.x)));
    float br = vnoise(r * vec2(0.025, 0.55)) * 0.55 + vnoise(r * vec2(0.06, 1.3) + 3.0) * 0.45;
    float blot = vnoise(cp * 0.03 + h * 4.0);
    vec3 paint = pc * (1.0 + (br - 0.5) * 0.06 * uLook.z + (blot - 0.5) * 0.03 * uLook.z);
    paint *= 1.0 - 0.07 * border;
    // the printed line shows faintly through thin paint
    paint = mix(paint, paint * ink * 1.1, line * uLook.x);
    col = mix(col, clamp(paint, 0.0, 1.0), pk);
  }

  // a soft light falloff across the canvas
  float v = length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0));
  col *= 1.0 - 0.06 * smoothstep(0.4, 1.0, v);
  return clamp(col, 0.0, 1.0);
}
`,x=new WeakMap,S=e=>e.uniforms?x.get(e.uniforms):void 0,C={fill:[.16,1,1,1],done:[0,1,1.5,1],lines:[.16,1,1,1]};function w(e,t){let n=e.image.data;n.fill(0),t.forEach((e,t)=>{let r=h(e.hex),i=_(e.hex);n.set([r[0],r[1],r[2],1],t*4),n.set([i[0],i[1],i[2],1],(p+t)*4)}),e.needsUpdate=!0}function T(c={}){let l=c.mode??`fill`,d=c.colors??16,h=new s(new Float32Array(256),p,2,t,e);h.minFilter=h.magFilter=i,w(h,f[d]);let g=new n(y());g.minFilter=a,g.magFilter=r,g.generateMipmaps=!0;let _={tPal:{value:h},tGlyph:{value:g},uN:{value:d},uProg:{value:+(l===`done`)},uWin:{value:m(d)},uWash:{value:l===`lines`?0:1},uLook:{value:new o().fromArray(C[l])},uGrid:{value:46},uKeep:{value:.07}},v={mode:l,n:d,prog:+(l===`done`),wash:l===`lines`?0:1,hold:0,restart:!1,look:[...C[l]],paused:!1};x.set(_,v);let S={frag:b,uniforms:_,scale:.5,background:u.background,update(e,t){S.scale=.5/Math.max(1,t.dpr);let n=_,r=v.n*1.15+2;v.paused||(v.restart?(v.wash=Math.max(0,v.wash-e/.8),v.wash<=0&&(v.restart=!1,v.prog=0,v.hold=0,v.mode===`done`&&(v.mode=`fill`))):v.mode===`fill`?(v.wash=Math.min(1,v.wash+e/.5),v.prog<1?v.prog=Math.min(1,v.prog+e/r):(v.hold+=e,v.hold>4.5&&(v.restart=!0))):v.mode===`done`?(v.wash=Math.min(1,v.wash+e/.5),v.prog=Math.min(1,v.prog+e/2.6)):(v.wash=Math.max(0,v.wash-e/.7),v.wash<=0&&(v.prog=0)));let i=C[v.mode],a=1-Math.exp(-e*5);for(let e=0;e<4;e++)v.look[e]+=(i[e]-v.look[e])*a;n.uLook.value.fromArray(v.look),n.uProg.value=v.prog,n.uWash.value=v.wash}};return S}function E(e,t){let n=S(e);n&&n.mode!==t&&(t===`fill`&&n.mode===`lines`&&(n.prog=0),n.mode=t,n.hold=0,t!==`fill`&&(n.restart=!1))}function D(e,t){let n=S(e);if(!n||n.n===t)return;n.n=t;let r=e.uniforms;w(r.tPal.value,f[t]),r.uN.value=t,r.uWin.value=m(t)}function O(e){let t=S(e);t&&(t.mode===`lines`&&(t.mode=`fill`),t.restart=!0,t.wash<=0&&(t.prog=0,t.restart=!1))}function k(e){let t=S(e);return t?t.prog*Math.min(1,t.wash*2):0}function A(e){let t=S(e);if(!t||t.wash<.5)return-1;let n=m(t.n),r=-1,i=9;for(let e=0;e<t.n;e++){let a=e/t.n*(1-n),o=(t.prog-a)/n;o>0&&o<1&&Math.abs(o-.5)<i&&(i=Math.abs(o-.5),r=e)}return r}function j(e,t){let n=S(e);if(!n)return 0;let r=m(n.n),i=t/n.n*(1-r);return Math.min(1,Math.max(0,(n.prog-i)/r))*Math.min(1,n.wash*2)}function M(e,t){let n=S(e);n&&(n.paused=t)}function N(e,t){let n=S(e);n&&(n.prog=t,n.wash=1,n.hold=0,n.restart=!1)}export{A as a,j as c,E as d,M as f,l as i,k as l,T as n,u as o,N as p,O as r,c as s,f as t,D as u};