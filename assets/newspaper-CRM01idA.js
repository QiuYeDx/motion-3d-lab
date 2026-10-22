import{Kt as e,bn as t,k as n,pt as r,yn as i}from"./events-9ce18a08.esm-BJiOHOtz.js";var a=[{id:`extra`,label:`黑白号外`},{id:`colour`,label:`彩色周末版`},{id:`wire`,label:`传真照片`}],o={title:`老报纸`,en:`Old Newspaper`,background:`#dedbd2`,theme:`light`},s={extra:{colour:0,line:0,cell:6.6,mis:0,lo:.11,hi:.9,gain:.26,spread:.2,rough:.24,fade:0,scan:0,paper:[.905,.855,.735]},colour:{colour:1,line:0,cell:6,mis:1,lo:.08,hi:.88,gain:.26,spread:.16,rough:.2,fade:1,scan:0,paper:[.925,.885,.775]},wire:{colour:0,line:1,cell:4.4,mis:0,lo:.06,hi:.86,gain:.2,spread:.24,rough:.16,fade:0,scan:1,paper:[.9,.86,.75]}},c=[`colour`,`line`,`cell`,`mis`,`lo`,`hi`,`gain`,`spread`,`rough`,`fade`,`scan`],l=(e,t,n)=>{let r={...e,paper:[0,0,0]};for(let i of c)r[i]=e[i]+(t[i]-e[i])*n;for(let i=0;i<3;i++)r.paper[i]=e.paper[i]+(t.paper[i]-e.paper[i])*n;return r},u=`本报讯据悉昨日上午时分发射场方面宣布试验取得圆满成功各界人士纷纷表示祝贺记者在现场看到人群欢呼雀跃城市交通秩序良好天气晴朗气温回升市场物价平稳工厂农田学校医院`,d=`THE MORNING EDITION CITY NEWS WEATHER MARKETS SPORTS LATE FINAL`;function f(){let t=1024,i=document.createElement(`canvas`);i.width=t,i.height=t;let a=i.getContext(`2d`);a.fillStyle=`#fff`,a.fillRect(0,0,t,t),a.translate(t,0),a.scale(-1,1),a.filter=`blur(0.8px)`;let o=7,s=()=>(o=o*16807%2147483647)/2147483647,c=`"Songti SC", "SimSun", "STSong", "Noto Serif CJK SC", serif`;for(let e=0;e<5;e++){let t=14+e*204,n=22;for(;n<1014;){let e=s();if(e<.08){a.fillStyle=`#222`,a.font=`700 30px ${c}`;let e=``;for(let t=0;t<6;t++)e+=u[Math.floor(s()*79)];a.fillText(e,t,n+30),n+=46}else if(e<.11&&n<824){let e=a.createLinearGradient(t,n,t+186,n+150);e.addColorStop(0,`#9a9a9a`),e.addColorStop(.5,`#5a5a5a`),e.addColorStop(1,`#b4b4b4`),a.fillStyle=e,a.fillRect(t,n+4,186,150),n+=170}else if(e<.14)a.fillStyle=`#333`,a.font=`600 13px Georgia, ${c}`,a.fillText(d.slice(Math.floor(s()*30),Math.floor(s()*30)+30),t,n+14),n+=22;else{let e=3+Math.floor(s()*8);a.fillStyle=`#3a3a3a`,a.font=`13px ${c}`;for(let r=0;r<e&&n<1014;r++){let i=r===0?`　`:``,o=r===e-1?4+Math.floor(s()*9):14;for(let e=0;e<o;e++)i+=u[Math.floor(s()*79)];a.fillText(i,t,n+13),n+=17}n+=6}}}let l=new n(i);return l.wrapS=l.wrapT=e,l.generateMipmaps=!1,l.minFilter=r,l.magFilter=r,l}var p=`
uniform vec4 uFrame;      // photo box in uv (x0, y0, x1, y1), y up
uniform float uBorder;    // box rule, CSS px (0 = none)
uniform float uColour, uLine, uCell, uMis, uLo, uHi, uGain, uSpread, uRough, uFade, uScan;
uniform float uLow;       // low-ink band strength
uniform float uGhost;     // set-off strength
uniform float uSmudge;
uniform float uAge;
uniform float uBandY;     // low-ink band centre, uv y
uniform float uCreaseY;   // fold, uv y (< 0: none)
uniform vec3 uPaper;
uniform sampler2D tGhost;

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
vec3 sceneAvg(vec2 p, float r) {
  return (sceneL(p) * 2.0 + sceneL(p + vec2(r, r)) + sceneL(p + vec2(-r, r)) + sceneL(p + vec2(r, -r)) + sceneL(p + vec2(-r, -r))) / 6.0;
}

/* cosine-spot AM dot (rotated) or horizontal line screen; analytic AA width (no derivatives) */
float inkScreen(vec2 p, float ang, float cell, float v, float rough) {
  vec2 q = rot(ang) * p / cell;
  float dotS = 0.5 * (cos(6.2831853 * q.x) + cos(6.2831853 * q.y));
  float lineS = cos(6.2831853 * p.y / cell);
  float spot = mix(dotS, lineS, uLine);
  v = clamp(v, 0.0, 1.0);
  float vd = v + 0.78 * v * (1.0 - v) * (1.0 - 2.0 * v);  // spot area → tone
  float w = 1.7 / cell + uSpread * 0.5;
  float T = mix(mix(1.0 + w, -1.0 - w, vd), cos(3.14159265 * v) * (1.0 + w), uLine);
  T += rough * min(1.0, v * 8.0) * min(1.0, (1.0 - v) * 8.0);
  float d = smoothstep(T - w, T + w, spot);
  // ink wicking into the fibres: a faint grey bleed around every dot
  float halo = smoothstep(T - w - 0.38, T + w, spot) * (0.04 + uSpread * 0.3);
  return max(d, halo * step(0.02, v));
}

vec3 printPhoto(vec2 px, vec2 cp, vec2 uv, vec3 paper) {
  float cell = uCell * uDpr;

  /* wirephoto: rows of the transmitted scan, each with its own gain and a little horizontal tear */
  float row = floor(px.y / cell);
  float rn = hash12(vec2(row, 3.7));
  float tear = (hash12(vec2(row, 9.1)) - 0.5) * 1.6 + (vnoise(vec2(row * 0.09, 1.0)) - 0.5) * 7.0;
  vec2 ps = px + vec2(tear * uDpr * uScan, 0.0);
  float bandW = sin(cp.y * 0.043 + 1.3) * 0.6 + sin(cp.y * 0.011 + 0.4) * 0.4;
  float grain = hash12(floor(cp / 1.5) + 0.5) - 0.5;
  float vAdd = uScan * ((rn - 0.5) * 0.09 + bandW * 0.05 + grain * 0.12);
  float drop = uScan * step(0.982, hash12(vec2(row, 1.3)));

  /* low-ink band: the fountain ran dry across part of the run, streaky along the paper path */
  float by = (uv.y - uBandY) * uRes.y / uDpr;
  float band = exp(-pow(by / 34.0, 2.0)) * (0.6 + 0.4 * vnoise(vec2(cp.x / 26.0, by / 300.0)));
  float inkLow = 1.0 - uLow * band * 0.6;

  float r0 = (vnoise(cp * 0.62) * 0.6 + vnoise(cp * 2.2 + 5.0) * 0.4 - 0.5) * uRough;

  vec3 col = paper;
  for (int i = 0; i < 4; i++) {
    if (i < 3 && uColour < 0.002) continue;
    vec2 o = (i == 0 ? vec2(2.4, -1.5) : i == 1 ? vec2(-1.9, 2.3) : i == 2 ? vec2(3.0, 2.6) : vec2(0.3, -0.2)) * uMis * uDpr;
    vec3 s = sceneAvg(ps - o, cell * 0.32);
    vec3 kq = 1.0 - s;
    float kmin = min(kq.r, min(kq.g, kq.b));
    float kG = smoothstep(0.3, 0.92, kmin) * kmin;
    float sep = i == 0 ? kq.r : i == 1 ? kq.g : kq.b;
    float v = i < 3 ? max(sep - kG * 0.8, 0.0) * uColour : mix(1.0 - luma(s), kG, uColour);
    v += vAdd * (i == 3 ? 1.0 : uColour);
    v = smoothstep(uLo, uHi, v);               // newsprint's short range
    v = v + uGain * v * (1.0 - v);             // dot gain
    float ang = i == 0 ? 0.2618 : i == 1 ? 1.309 : i == 2 ? 0.0 : 0.7854;
    float rough = r0 * (i == 1 || i == 3 ? 1.0 : -1.0);
    float d = inkScreen(ps - o, ang, cell, v, rough);
    vec2 mp = rot(0.6 + float(i)) * cp;
    d *= (0.84 + 0.1 * vnoise(mp * 0.021 + float(i) * 7.1) + 0.06 * vnoise(mp * 0.07)) * inkLow * (1.0 - drop * 0.55);
    vec3 ink = i == 0 ? mix(vec3(0.0, 0.6, 0.86), vec3(0.16, 0.6, 0.82), uFade)
             : i == 1 ? mix(vec3(0.9, 0.08, 0.5), vec3(0.9, 0.32, 0.5), uFade)
             : i == 2 ? mix(vec3(1.0, 0.88, 0.0), vec3(0.98, 0.85, 0.26), uFade)
             : vec3(0.15, 0.135, 0.12);
    col *= mix(vec3(1.0), ink, d);
  }
  return col;
}

vec3 paperAt(vec2 cp, vec2 uv, vec2 res) {
  vec3 c = uPaper;
  float blotch = fbm(cp / 230.0 + 4.0) - 0.5;
  vec2 r1 = rot(0.4) * cp;
  float fib = smoothstep(0.7, 0.95, vnoise(vec2(r1.x * 0.05, r1.y * 0.7)));
  float grain = hash12(floor(cp)) - 0.5;
  c *= 1.0 - 0.05 * blotch - 0.03 * grain - 0.035 * fib;
  // browning toward the edges, irregular
  vec2 e = min(uv, 1.0 - uv) * res;
  float ed = min(e.x, e.y) + (fbm(cp / 70.0 + 3.0) - 0.5) * 130.0;
  float age = smoothstep(105.0, -10.0, ed) * uAge;
  c = mix(c, c * vec3(0.88, 0.76, 0.56), age * 0.7);
  // foxing: small rust spots with a paler halo, more of them near the edges
  float fx = vnoise(cp / 3.2 + 31.0) * vnoise(cp / 29.0 + 7.0) * (0.75 + 0.25 * vnoise(cp / 400.0)) + age * 0.16;
  float fox = smoothstep(0.72, 0.8, fx);
  c = mix(c, c * vec3(0.8, 0.65, 0.46), fox * 0.75 * uAge);
  // the facing page set off in reverse
  float g = 1.0 - textureLod(tGhost, cp / 1024.0 + vec2(0.13, 0.27), 0.0).r;
  c *= 1.0 - uGhost * 0.085 * g;
  return c;
}

/* greasy thumb print: whorled ridges inside a partial ellipse */
float thumb(vec2 cp, vec2 ctr, float ang, float sz) {
  vec2 q = rot(ang) * (cp - ctr) / sz;
  q.y *= 0.76;
  float r = length(q);
  float mask = smoothstep(1.0, 0.55, r) * smoothstep(0.25, 0.7, vnoise(q * 2.4 + ctr * 0.01));
  vec2 w = q + vec2(0.0, 0.22 * q.x * q.x);
  float ph = length(w * vec2(1.0, 1.08)) * sz / 2.5 + vnoise(q * 3.0) * 1.4;
  float ridge = smoothstep(0.1, 0.9, 0.5 + 0.5 * sin(ph * 6.2831853));
  return mask * ridge;
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 res = uRes / uDpr;
  vec2 uv = px / uRes;
  vec3 paper = paperAt(cp, uv, res);

  vec2 b0 = uFrame.xy * res, b1 = uFrame.zw * res;
  vec2 dq = max(b0 - cp, cp - b1);
  float outside = max(dq.x, dq.y);             // < 0 inside the photo box, CSS px

  vec3 col = paper;
  if (outside < 0.0) {
#ifdef RAW
    col = sceneL(px) * mix(vec3(1.0), paper / uPaper, 0.4);
#else
    col = printPhoto(px, cp, uv, paper);
#endif
  }
  // box rule just outside the photo
  float rule = step(0.0, outside) * (1.0 - smoothstep(uBorder - 0.6, uBorder + 0.6, outside)) * step(0.01, uBorder);
  col = mix(col, col * vec3(0.17, 0.15, 0.13), rule * (0.8 + 0.2 * vnoise(cp * 0.3)));

  // ink smear by the photo's lower right, thumb prints
  vec2 sc = vec2(mix(b0.x, b1.x, 0.86), mix(b0.y, b1.y, 0.1));
  vec2 sq = rot(-0.35) * (cp - sc) / vec2(80.0, 18.0);
  float smear = smoothstep(1.0, 0.2, length(sq)) * smoothstep(0.42, 0.8, fbm(sq * 1.6 + 3.0));
  col *= 1.0 - uSmudge * 0.16 * smear;
  float tp = thumb(cp, vec2(0.885, 0.2) * res, 0.5, 30.0) + thumb(cp, vec2(0.075, 0.6) * res, -0.9, 27.0) * 0.8;
  col *= 1.0 - uSmudge * 0.14 * tp;

  // central fold: shadow below, a highlight on the ridge, ink cracked along it
  if (uCreaseY > 0.0) {
    float y = cp.y - uCreaseY * res.y + (vnoise(vec2(cp.x / 160.0, 2.0)) - 0.5) * 3.0;
    float sh = exp(-pow(max(-y, 0.0) / 10.0, 2.0)) * step(y, 0.0) * 0.14 + exp(-pow(y / 30.0, 2.0)) * 0.04;
    float hl = exp(-pow((y - 1.8) / 1.6, 2.0)) * 0.1;
    float crack = exp(-pow(y / 0.9, 2.0)) * smoothstep(0.35, 0.75, vnoise(vec2(cp.x / 3.0, 7.0)));
    col = mix(col, paper, crack * 0.55);
    col *= 1.0 - sh;
    col += hl * (vec3(1.0) - col);
  }
  // a little overall falloff, the sheet isn't flat-lit
  vec2 vu = uv - 0.5;
  col *= 1.0 - dot(vu, vu) * 0.14;
  return clamp(col, 0.0, 1.0);
}
`,m=e=>({gain:.72+.55*e,spread:.6+.8*e,rough:.65+.75*e,mis:.55+1*e,low:.3+.7*e,ghost:.5+.5*e,smudge:.55+.45*e});function h(e={}){let n=e.mode??`extra`,r=e.quality===`good`?0:1,a={from:s[n],to:s[n],cur:s[n],k:1,mode:n,poor:r,poorTarget:r},c={uFrame:{value:new t(0,0,1,1)},uBorder:{value:0},uColour:{value:0},uLine:{value:0},uCell:{value:6.6},uMis:{value:0},uLo:{value:.1},uHi:{value:.8},uGain:{value:.3},uSpread:{value:.2},uRough:{value:.2},uFade:{value:0},uScan:{value:0},uLow:{value:.5},uGhost:{value:1},uSmudge:{value:1},uAge:{value:1},uBandY:{value:.64},uCreaseY:{value:.5},uPaper:{value:new i},tGhost:{value:f()}},u=()=>{let e=a.cur,t=m(a.poor);c.uColour.value=e.colour,c.uLine.value=e.line,c.uCell.value=e.cell,c.uMis.value=e.mis*t.mis,c.uLo.value=e.lo,c.uHi.value=e.hi,c.uGain.value=e.gain*t.gain,c.uSpread.value=e.spread*t.spread,c.uRough.value=e.rough*t.rough,c.uFade.value=e.fade,c.uScan.value=e.scan,c.uLow.value=t.low,c.uGhost.value=t.ghost,c.uSmudge.value=t.smudge,c.uPaper.value.set(...e.paper)};u();let d=e=>e*e*(3-2*e);return{frag:p,uniforms:c,background:o.background,np:a,update(e){a.shown===void 0&&(a.shown=performance.now());let t=!1;a.k<1&&(a.k=Math.min(1,a.k+e/.75),a.cur=l(a.from,a.to,d(a.k)),t=!0),Math.abs(a.poorTarget-a.poor)>1e-4&&(a.poor+=(a.poorTarget-a.poor)*Math.min(1,e*5),t=!0),t&&u()}}}function g(e){return{frag:`#define RAW
`+p,uniforms:e.uniforms,background:e.background}}function _(e,t){let n=e.np;n&&n.mode!==t&&(n.mode=t,n.from=n.cur,n.to=s[t],n.k=0)}function v(e,t){let n=e.np;n&&(n.poorTarget=+(t===`poor`))}function y(e,t,n=1.2,r=.5,i=.36){let a=e.uniforms;a&&(a.uFrame.value.set(t.x0,1-t.bottom,t.x1,1-t.top),a.uBorder.value=n,a.uCreaseY.value=r<0?-1:1-r,a.uBandY.value=1-i)}export{y as a,a as i,g as n,_ as o,o as r,v as s,h as t};