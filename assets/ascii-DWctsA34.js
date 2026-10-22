import{P as e,ht as t,k as n,pt as r,yn as i}from"./events-9ce18a08.esm-BJiOHOtz.js";var a=[{id:`ramp`,label:`明暗`},{id:`edge`,label:`轮廓`},{id:`color`,label:`彩色`},{id:`han`,label:`汉字`},{id:`braille`,label:`盲文`},{id:`matrix`,label:`代码雨`}],o={title:`字符画`,en:`ASCII Art`,background:`#0a0c0b`,theme:`dark`},s=` .:-=+*#%@`,c=`ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789Z`,l=`　丶一二十人三上口土王日田由目石回米国東围星語鬼雷燕龍舞鬱龘`,u=`"Cascadia Mono", Consolas, "SF Mono", Menlo, "Courier New", monospace`,d=`"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif`,f=`"MS Gothic", "Yu Gothic", "Meiryo", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", monospace`,p=48,m=80,h=80,g=null;function _(e){let i=new n(e);return i.colorSpace=``,i.minFilter=t,i.magFilter=r,i.generateMipmaps=!0,i.anisotropy=1,i.needsUpdate=!0,i}function v(e,t){let n=document.createElement(`canvas`);n.width=e,n.height=t;let r=n.getContext(`2d`,{willReadFrequently:!0});return r.fillStyle=`#000`,r.fillRect(0,0,e,t),r.fillStyle=`#fff`,r.strokeStyle=`#fff`,r.textAlign=`center`,r.textBaseline=`middle`,{c:n,g:r}}function y(){let e=v(384,640),t=e=>[e%8*p,Math.floor(e/8)*m];e.g.font=`700 62px ${u}`;for(let n=0;n<10;n++){let[r,i]=t(n);e.g.fillText(s[n],r+p/2,i+m/2+3)}e.g.lineWidth=7,e.g.lineCap=`round`,[[p/2,7,p/2,73],[7,m/2,41,m/2],[7,73,41,7],[7,7,41,73],[7,70,41,70]].forEach(([n,r,i,a],o)=>{let[s,c]=t(10+o);e.g.beginPath(),e.g.moveTo(s+n,c+r),e.g.lineTo(s+i,c+a),e.g.stroke()}),e.g.font=`700 64px ${f}`;for(let n=0;n<48;n++){let[r,i]=t(15+n),a=c[n]??`0`;e.g.save(),e.g.translate(r+p/2,i+m/2+2),n<38&&e.g.scale(-1,1),e.g.fillText(a,0,0),e.g.restore()}let n=v(h,h);n.g.font=`500 68px ${d}`;let r=[...l].map(e=>{n.g.fillStyle=`#000`,n.g.fillRect(0,0,h,h),n.g.fillStyle=`#fff`,n.g.fillText(e,h/2,43);let t=n.g.getImageData(0,0,h,h).data,r=0;for(let e=0;e<t.length;e+=4)r+=t[e];return{ch:e,cov:r/(20400*h)}});r.sort((e,t)=>e.cov-t.cov);let i=[];for(let e of r)(!i.length||e.cov-i[i.length-1].cov>.006)&&i.push(e);let a=v(640,320);a.g.font=`500 68px ${d}`,i.slice(0,32).forEach((e,t)=>a.g.fillText(e.ch,t%8*h+h/2,Math.floor(t/8)*h+h/2+3));let o=i[Math.min(i.length,32)-1].cov||1,g=v(768,1280),y=[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[0,3],[1,3]];for(let e=0;e<256;e++){let t=e%16*p,n=Math.floor(e/16)*m;for(let r=0;r<8;r++){if(!(e&1<<r))continue;let[i,a]=y[r];g.g.beginPath(),g.g.arc(t+p*(.3+.4*i),n+m*(.14+.24*a),7.2,0,Math.PI*2),g.g.fill()}}return{ascii:_(e.c),han:_(a.c),braille:_(g.c),hanRamp:i.slice(0,32).map(e=>e.ch).join(``),hanCov:Array.from({length:32},(e,t)=>i[t]?i[t].cov/o:2)}}var b=`
uniform sampler2D tAscii;
uniform sampler2D tHan;
uniform sampler2D tBraille;
uniform float uCell;      // cell height, CSS px
uniform float uModeA;
uniform float uModeB;
uniform float uMix;       // 0 → A, 1 → B (cell-by-cell dissolve)
uniform vec3 uLens;       // x, y, radius in device px (radius 0 = off)
uniform vec3 uLensColor;
uniform float uHanCov[32];
uniform float uHanN;
uniform float uEdgeT;

const float ASPECT = 0.6;
const vec3 BG = vec3(0.039, 0.047, 0.043);

float tone(vec3 c) {
  float v = clamp((luma(c) - 0.035) / 0.78, 0.0, 1.0);
  return pow(v, 0.82);
}

// read a glyph tile with an explicit LOD (no derivative seams at cell borders)
float atlas(sampler2D t, vec2 grid, float tileH, float idx, vec2 uv, float cellH, float blur) {
  float col = mod(idx, grid.x);
  float row = floor(idx / grid.x);
  uv = clamp(uv, 0.015, 0.985);
  vec2 q = vec2((col + uv.x) / grid.x, 1.0 - (row + 1.0 - uv.y) / grid.y);
  float lod = max(log2(tileH / cellH) - 0.4, 0.0) + blur;
  return textureLod(t, q, lod).r;
}
vec3 cellScene(vec2 c, vec2 cs) {
  vec2 o = cs * 0.25;
  return (sceneAt(c - o) + sceneAt(c + o) + sceneAt(c + vec2(o.x, -o.y)) + sceneAt(c + vec2(-o.x, o.y))) * 0.25;
}

vec2 monoCell() { return vec2(ASPECT, 1.0) * uCell * uDpr; }
vec2 hanCell() { return vec2(1.0) * uCell * 1.3 * uDpr; }
vec2 cellOf(float m) { return abs(m - 3.0) < 0.5 ? hanCell() : monoCell(); }

/*
 * Compile cost (ANGLE → HLSL/FXC is slow on big shaders): the mode is chosen first and every expensive
 * routine appears once in the code — one Sobel, one Braille sampler, one glyph read per atlas. Taps that
 * use implicit-derivative texture reads are written out by hand (no loops to unroll, no dynamically
 * indexed arrays); glyph reads use textureLod.
 */

// one Sobel tap with weights (wx, wy): accumulates the depth and the normal+coverage gradients
void sobelTap(vec2 p, float wx, float wy, inout vec2 gD, inout vec4 hx, inout vec4 hy) {
  float d = log(max(depthAt(p), 1e-3)) * 3.0;
  vec4 n = texture2D(tNormal, p / uRes);
  vec4 f = vec4(n.rgb * 2.0 - 1.0, n.a * 1.6);
  gD += vec2(wx, wy) * d;
  hx += wx * f;
  hy += wy * f;
}

// one Braille dot: tone at a sub-position against an ordered-dither threshold t (0..7)
float dot8(vec2 o, vec2 cs, vec2 q, float t, inout float sum) {
  float l = tone(sceneAt(o + q * cs));
  sum += l;
  return l > (t + 0.5) / 8.0 * 0.82 + 0.06 ? 1.0 : 0.0;
}

vec3 renderMode(float m, vec2 px) {
  vec2 cs = cellOf(m);
  vec2 id = floor(px / cs), uv = fract(px / cs), c = (id + 0.5) * cs;
  vec3 sc = cellScene(c, cs);
  float v = tone(sc);

  int atl = 0; // 0 mono, 1 CJK, 2 Braille
  float idx = min(floor(v * 10.0), 9.0);
  vec3 ink = vec3(0.84, 0.96, 0.88);
  float gA = mix(0.5, 1.0, v);
  float hA = 0.22 * v;
  vec3 base = BG;

  if (m < 0.5) {
    /* 0 · 明暗 — the defaults above */
  } else if (m < 1.5) {
    /* 1 · 轮廓 — cell-scale Sobel, structure-tensor orientation */
    vec2 o = cs * 0.5;
    vec2 gD = vec2(0.0);
    vec4 hx = vec4(0.0), hy = vec4(0.0);
    sobelTap(c + vec2(-o.x, -o.y), -1.0, -1.0, gD, hx, hy);
    sobelTap(c + vec2(0.0, -o.y), 0.0, -2.0, gD, hx, hy);
    sobelTap(c + vec2(o.x, -o.y), 1.0, -1.0, gD, hx, hy);
    sobelTap(c + vec2(-o.x, 0.0), -2.0, 0.0, gD, hx, hy);
    sobelTap(c + vec2(o.x, 0.0), 2.0, 0.0, gD, hx, hy);
    sobelTap(c + vec2(-o.x, o.y), -1.0, 1.0, gD, hx, hy);
    sobelTap(c + vec2(0.0, o.y), 0.0, 2.0, gD, hx, hy);
    sobelTap(c + vec2(o.x, o.y), 1.0, 1.0, gD, hx, hy);
    float gyD = gD.y;
    float md = length(gD); // clamp depth so a silhouette doesn't dwarf everything else
    if (md > 6.0) gD *= 6.0 / md;
    float Jxx = gD.x * gD.x + dot(hx, hx);
    float Jxy = gD.x * gD.y + dot(hx, hy);
    float Jyy = gD.y * gD.y + dot(hy, hy);
    float s = sqrt(Jxx + Jyy);
    if (s > uEdgeT) {
      float th = 0.5 * atan(2.0 * Jxy, Jxx - Jyy);           // gradient orientation
      float phi = mod(th + 1.5707963 + 0.3926991, 3.1415927); // line orientation, offset by half a bin
      float k = floor(phi / 0.7853982);
      idx = k < 0.5 ? (gyD < -0.05 ? 14.0 : 11.0) : (k < 1.5 ? 12.0 : (k < 2.5 ? 10.0 : 13.0));
      ink = vec3(0.49, 1.0, 0.6);
      gA = mix(0.65, 1.0, smoothstep(uEdgeT, uEdgeT * 1.8, s));
      hA = 0.35;
    } else {
      ink = vec3(0.36, 0.5, 0.42);
      gA = mix(0.45, 0.95, v);
      hA = 0.12 * v;
    }
  } else if (m < 2.5) {
    /* 2 · 彩色 */
    float mx = max(max(sc.r, sc.g), sc.b);
    vec3 hue = sc / max(mx, 0.08);
    hue = mix(vec3(luma(hue)), hue, 1.35);
    ink = clamp(hue, 0.0, 1.0) * mix(0.55, 1.0, v);
    gA = 1.0;
    hA = 0.25 * v;
    base = BG * (1.0 - 0.6 * v) + sc * 0.07;
  } else if (m < 3.5) {
    /* 3 · 汉字 */
    float best = 0.0, bd = 9.0;
    for (int i = 0; i < 32; i++) {
      if (float(i) >= uHanN) break;
      float d = abs(uHanCov[i] - v);
      if (d < bd) { bd = d; best = float(i); }
    }
    atl = 1;
    idx = best;
    ink = mix(vec3(0.62, 0.44, 0.33), vec3(1.0, 0.93, 0.8), v);
    gA = mix(0.55, 1.0, v);
    hA = 0.2 * v;
  } else if (m < 4.5) {
    /* 4 · 盲文 — dot n (1..8) → bit n-1 */
    vec2 o = id * cs;
    float sum = 0.0;
    float bits = dot8(o, cs, vec2(0.3, 0.86), 0.0, sum)
      + 2.0 * dot8(o, cs, vec2(0.3, 0.62), 6.0, sum)
      + 4.0 * dot8(o, cs, vec2(0.3, 0.38), 1.0, sum)
      + 8.0 * dot8(o, cs, vec2(0.7, 0.86), 4.0, sum)
      + 16.0 * dot8(o, cs, vec2(0.7, 0.62), 2.0, sum)
      + 32.0 * dot8(o, cs, vec2(0.7, 0.38), 5.0, sum)
      + 64.0 * dot8(o, cs, vec2(0.3, 0.14), 7.0, sum)
      + 128.0 * dot8(o, cs, vec2(0.7, 0.14), 3.0, sum);
    float bv = sum / 8.0;
    atl = 2;
    idx = bits;
    ink = mix(vec3(0.45, 0.72, 0.95), vec3(0.85, 0.96, 1.0), bv);
    gA = mix(0.6, 1.0, bv);
    hA = 0.25 * bv;
  } else {
    /* 5 · 代码雨 */
    float rows = ceil(uRes.y / cs.y);
    float row = rows - 1.0 - id.y; // counted from the top
    float trail = 0.0, head = 0.0;
    for (int d = 0; d < 3; d++) {
      float sd = float(d) * 17.13;
      float sp = mix(6.0, 17.0, hash12(vec2(id.x, 3.1 + sd)));
      float L = mix(10.0, 30.0, hash12(vec2(id.x, 7.7 + sd)));
      float period = rows + L + rows * 0.8 * hash12(vec2(id.x, 9.1 + sd));
      float hp = mod(uTime * sp + hash12(vec2(id.x, 1.3 + sd)) * period, period);
      float dist = hp - row;
      if (dist >= 0.0 && dist < L) trail = max(trail, pow(1.0 - dist / L, 1.7));
      if (dist >= 0.0 && dist < 1.0) head = 1.0;
    }
    float rate = 0.6 + 6.0 * hash12(id + 4.2);
    idx = 15.0 + floor(hash12(id + floor(uTime * rate + hash12(id) * 9.0) * 0.731) * 47.99);
    float b = trail * (0.14 + 1.5 * v) + v * 0.55 + head * (0.35 + 0.9 * v);
    ink = mix(vec3(0.3, 1.0, 0.5), vec3(0.85, 1.0, 0.9), clamp(head * 0.8 + v * v * 0.35, 0.0, 1.0));
    gA = b;
    hA = b * 0.45;
  }

  // the single glyph read (+ its blurred mip as a halo)
  float g, hl;
  if (atl == 0) {
    g = smoothstep(0.12, 0.75, atlas(tAscii, vec2(8.0), 80.0, idx, uv, cs.y, 0.0));
    hl = atlas(tAscii, vec2(8.0), 80.0, idx, uv, cs.y, 2.2);
  } else if (atl == 1) {
    g = smoothstep(0.1, 0.7, atlas(tHan, vec2(8.0, 4.0), 80.0, idx, uv, cs.y, 0.0));
    hl = atlas(tHan, vec2(8.0, 4.0), 80.0, idx, uv, cs.y, 2.0);
  } else {
    g = smoothstep(0.1, 0.7, atlas(tBraille, vec2(16.0), 80.0, idx, uv, cs.y, 0.0));
    hl = atlas(tBraille, vec2(16.0), 80.0, idx, uv, cs.y, 2.0);
  }
  return base + ink * (g * gA + hl * hA);
}

vec3 stylize(vec2 px) {
  // cell-by-cell dissolve: pick the mode first, so one mode is evaluated per pixel
  float m = uModeB;
  float flash = 0.0;
  if (uMix < 1.0 && uModeA != uModeB) {
    float h = hash12(floor(px / cellOf(uModeB)) + 31.7) * 0.8;
    if (h < uMix) flash = max(0.0, 1.0 - (uMix - h) * 8.0); // freshly flipped cells flash
    else m = uModeA;
  }
  vec3 col = renderMode(m, px);
  col = col * (1.0 + 2.2 * flash) + vec3(0.03, 0.09, 0.05) * flash;

  /* lens: the untouched render inside a circle, with a glowing rim */
  if (uLens.z > 0.5) {
    float d = length(px - uLens.xy);
    float r = uLens.z;
    float aa = 1.2 * uDpr;
    float inside = 1.0 - smoothstep(r - aa, r + aa, d);
    vec3 raw = sceneAt(px) * (1.0 - 0.25 * smoothstep(r * 0.55, r, d));
    col = mix(col, raw, inside);
    float rim = exp(-abs(d - r) / (1.6 * uDpr));
    float glow = exp(-max(d - r, 0.0) / (14.0 * uDpr)) * step(r, d);
    col += uLensColor * (rim * 0.9 + glow * 0.18);
  }
  return col;
}
`,x=new WeakMap,S=e=>a.findIndex(t=>t.id===e);function C(){g??=y();let t=g,n={tAscii:{value:t.ascii},tHan:{value:t.han},tBraille:{value:t.braille},uCell:{value:11},uModeA:{value:1},uModeB:{value:1},uMix:{value:1},uLens:{value:new i(0,0,0)},uLensColor:{value:new e(.49,1,.6)},uHanCov:{value:t.hanCov},uHanN:{value:Math.min(32,t.hanRamp.length)},uEdgeT:{value:1.25}},r={u:n,cellTarget:11},a={frag:b,uniforms:n,normals:!0,scale:typeof window<`u`&&window.devicePixelRatio>=1.5?.5:1,update(e){n.uMix.value<1&&(n.uMix.value=Math.min(1,n.uMix.value+e/.7),n.uMix.value>=1&&(n.uModeA.value=n.uModeB.value));let t=1-Math.exp(-e*7);n.uCell.value+=(r.cellTarget-n.uCell.value)*t,Math.abs(r.cellTarget-n.uCell.value)<.01&&(n.uCell.value=r.cellTarget)}};return x.set(a,r),a}function w(e,t,n=!1){let r=x.get(e);if(!r)return;let i=S(t),a=r.u;n?(a.uModeA.value=a.uModeB.value=i,a.uMix.value=1):a.uModeB.value!==i&&(a.uMix.value>=.5&&(a.uModeA.value=a.uModeB.value),a.uModeB.value=i,a.uMix.value=0)}function T(e,t,n=!1){let r=x.get(e);r&&(r.cellTarget=t,n&&(r.u.uCell.value=t))}function E(e,t,n,r){x.get(e)?.u.uLens.value.set(t,n,r)}function D(){return g??=y(),{ascii:s,han:g.hanRamp.replace(`　`,` `),braille:`⠀⠁⠃⠇⡇⣇⣧⣷⣿`}}export{T as a,C as i,a as n,E as o,D as r,w as s,o as t};