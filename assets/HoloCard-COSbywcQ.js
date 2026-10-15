import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CX_WDEyT.js";import{t as i}from"./use-spring-BV8nDvvz.js";import{t as a}from"./use-motion-value-CIZAIwyH.js";import{n as o}from"./index-uImfd-0P.js";import{Bt as s,X as c,Xt as l,Zt as u,_n as d,dt as f,gn as p,h as m,pn as h,pt as g,u as _,yt as v,z as y}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as b}from"./react-three-fiber.esm-BQtD7wyt.js";import{n as x}from"./iso-C377rVhz.js";import{t as S}from"./Seg-BfWvO_Xs.js";import{r as C,t as w}from"./dist-vKXJJnic.js";import{n as T,r as E}from"./glsl-CTWV-b_3.js";var D=e(t(),1),O=1600,k=1008,A=O/85.6,j=`'SF Pro Display', 'Inter', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif`,M=`'JetBrains Mono', 'Cascadia Code', 'SF Mono', Consolas, 'Courier New', monospace`,N=`'Segoe Script', 'Brush Script MT', 'Snell Roundhand', 'STKaiti', cursive`,P=`'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif`;function F(e){let t=document.createElement(`canvas`);t.width=O,t.height=k;let n=t.getContext(`2d`,{willReadFrequently:!0});return n.fillStyle=`#000`,n.fillRect(0,0,O,k),n.fillStyle=`#fff`,n.strokeStyle=`#fff`,n.textBaseline=`alphabetic`,e(n),n.getImageData(0,0,O,k).data}function I(e){let t=new Uint8Array(O*k*4);for(let n=0;n<k;n++){let r=n*O*4,i=(1007-n)*O*4;for(let n=0;n<O*4;n+=4)t[i+n]=e[0][r+n],t[i+n+1]=e[1][r+n],t[i+n+2]=e[2][r+n],t[i+n+3]=e[3][r+n]}let n=new y(t,O,k,s,h);return n.generateMipmaps=!0,n.minFilter=g,n.magFilter=f,n.anisotropy=8,n.colorSpace=``,n.needsUpdate=!0,n}var L=e=>e*A;function R(e,t,n,r,i,a={}){e.save(),e.font=`${a.weight??500} ${L(i)}px ${a.font??j}`,e.letterSpacing=`${L(a.spacing??0)}px`,e.textAlign=a.align??`left`;let o=Math.round((a.value??1)*255);e.fillStyle=`rgb(${o},${o},${o})`,e.fillText(t,L(n),L(r)),e.restore()}function z(e,t,n,r,i,a){e.beginPath(),e.roundRect(L(t),L(n),L(r),L(i),L(a))}var B={x:63,y:21,r0:12.5,r1:19.5};function V(e,t=1){let n=Math.round(t*255);e.fillStyle=`rgb(${n},${n},${n})`,e.strokeStyle=e.fillStyle,e.beginPath(),e.arc(L(B.x),L(B.y),L(B.r1),0,Math.PI*2),e.arc(L(B.x),L(B.y),L(B.r0),0,Math.PI*2,!0),e.fill(`evenodd`),e.lineWidth=L(.35),e.beginPath(),e.ellipse(L(B.x),L(B.y),L(26),L(9),-.42,0,Math.PI*2),e.stroke(),e.beginPath(),e.arc(L(B.x+24.2*Math.cos(-1.32)),L(B.y+9*Math.sin(-1.32)+1.5),L(1.3),0,Math.PI*2),e.fill()}function ee(e,t,n){let r=11.6;e.fillStyle=`#fff`,z(e,t,n,r,9,1.4),e.fill(),e.strokeStyle=`rgb(128,128,128)`,e.lineWidth=L(.32),e.beginPath(),e.moveTo(L(t),L(n+3)),e.lineTo(L(t+r*.34),L(n+3)),e.moveTo(L(t),L(n+6)),e.lineTo(L(t+r*.34),L(n+6)),e.moveTo(L(t+r*.66),L(n+3)),e.lineTo(L(t+r),L(n+3)),e.moveTo(L(t+r*.66),L(n+6)),e.lineTo(L(t+r),L(n+6)),e.moveTo(L(t+r*.34),L(n)),e.lineTo(L(t+r*.34),L(n+9)),e.moveTo(L(t+r*.66),L(n)),e.lineTo(L(t+r*.66),L(n+9)),e.stroke(),z(e,t+r*.34,n+9*.3,r*.32,3.6,.8),e.stroke()}function te(e,t,n,r=1){let i=Math.round(r*255);e.strokeStyle=`rgb(${i},${i},${i})`,e.lineWidth=L(.45),e.lineCap=`round`;for(let r=0;r<4;r++)e.beginPath(),e.arc(L(t),L(n),L(1.2+r*1.25),-.75,.75),e.stroke()}function ne(){return I([F(e=>{R(e,`HALO`,8,13.2,6.4,{weight:700,spacing:.9}),R(e,`MEMBERS  CLUB`,8.2,17.2,1.75,{font:M,spacing:.55,value:.8}),R(e,`PLATINUM`,77.6,50.6,2,{font:M,weight:600,spacing:.7,align:`right`,value:.9}),te(e,23.6,28,.85),R(e,`6288  1024  7731  0520`,8,41.5,4.6,{font:M,weight:500,spacing:.25}),R(e,`CARD HOLDER`,8.2,46.6,1.5,{font:M,spacing:.4,value:.6}),R(e,`LIN ZHIYUAN`,8,50.6,2.9,{weight:600,spacing:.45}),R(e,`VALID THRU`,47,46.6,1.5,{font:M,spacing:.4,value:.6}),R(e,`08 / 31`,47,50.6,2.9,{font:M,weight:500,spacing:.2})}),F(e=>{e.fillStyle=`rgb(40,40,40)`,e.fillRect(0,0,O,k),V(e,1),e.save(),e.filter=`blur(${L(.25)}px)`,e.fillStyle=`rgb(210,210,210)`,e.beginPath(),e.moveTo(L(37),0),e.lineTo(L(44.5),0),e.lineTo(L(57),L(26)),e.lineTo(L(50),L(29)),e.closePath(),e.fill(),e.restore(),R(e,`HALO`,8,13.2,6.4,{weight:700,spacing:.9})}),F(e=>ee(e,8.2,21.5)),F(e=>{e.filter=`blur(${L(.45)}px)`,V(e,.9),e.filter=`blur(${L(.12)}px)`,R(e,`HALO`,8,13.2,6.4,{weight:700,spacing:.9,value:.7}),R(e,`6288  1024  7731  0520`,8,41.5,4.6,{font:M,weight:500,spacing:.25,value:.55})})])}function H(){return I([F(e=>{R(e,`AUTHORIZED SIGNATURE · 持卡人签名`,8.2,22.6,1.45,{font:M,spacing:.25,value:.65}),R(e,`Lin Zhiyuan`,11,30.4,4.6,{font:N,weight:400}),R(e,`731`,61.3,30.2,2.6,{font:M,weight:600,spacing:.3}),R(e,`CVV`,61.3,22.6,1.45,{font:M,spacing:.3,value:.65}),[[`本卡仅限持卡人本人使用，不得转借。积分与权益以 HALO 会员条款为准。`,P],[`THIS CARD IS THE PROPERTY OF HALO MEMBERS CLUB.`,M],[`IF FOUND, PLEASE CALL THE NUMBER BELOW.`,M]].forEach(([t,n],r)=>R(e,t,8.2,38.2+r*2.9,1.55,{font:n,spacing:n===M?.12:.1,value:.62})),R(e,`客服热线 400-820-0520`,8.2,50.6,2.1,{font:P,weight:600,value:.9}),R(e,`halo.club`,77.6,50.6,2.1,{font:M,weight:500,align:`right`,value:.9,spacing:.15})}),F(e=>{e.fillStyle=`rgb(26,26,26)`,e.fillRect(0,0,O,k),e.fillStyle=`#fff`,z(e,66.2,35.4,11.4,9.2,1.2),e.fill()}),F(e=>{z(e,8.2,24.4,49.5,8.4,.6),e.fill(),e.fillStyle=`rgb(150,150,150)`,z(e,59.6,24.4,9,8.4,.6),e.fill()}),F(e=>{e.fillRect(0,L(4.6),O,L(11.6))})])}var U=n(),W=[{key:`aurora`,zh:`极光`,baseA:`#e4e7ef`,baseB:`#b3bccf`,text:`#171b2a`,edge:`#cfd5e2`,chip:`#dcbc78`,textFoil:0,foil:1,glitter:.7,glitterAll:.12,pa:[.68,.68,.72],pb:[.34,.34,.32],pc:[1,1,1],pd:[0,.33,.67],pat:[1,0,0],light:1,bg:`#9ef0ff`},{key:`gold`,zh:`金箔`,baseA:`#14110c`,baseB:`#2b2218`,text:`#ead29a`,edge:`#b8955a`,chip:`#e3c47e`,textFoil:1,foil:1,glitter:.9,glitterAll:.12,pa:[.8,.62,.36],pb:[.2,.17,.14],pc:[1,1,1],pd:[0,.07,.17],pat:[0,1,0],light:0,bg:`#ffcf7a`},{key:`night`,zh:`暗夜`,baseA:`#060609`,baseB:`#14121e`,text:`#dcdeea`,edge:`#2c2a3a`,chip:`#c8ccd8`,textFoil:.35,foil:.9,glitter:1.1,glitterAll:.6,pa:[.32,.3,.46],pb:[.32,.28,.38],pc:[1,1,1],pd:[.62,.72,.88],pat:[0,0,1],light:0,bg:`#a78bff`}],G=e=>[...T(e.baseA),...T(e.baseB),...T(e.text),...T(e.edge),...T(e.chip),e.textFoil,e.foil,e.glitter,e.glitterAll,...e.pa,...e.pb,...e.pc,...e.pd,...e.pat,e.light,...T(e.bg)],K=`
varying vec2 vUv;
varying vec3 vWPos;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  mat3 m = mat3(modelMatrix);
  vN = normalize(m * vec3(0.0, 0.0, 1.0));
  vT = normalize(m * vec3(1.0, 0.0, 0.0));
  vB = normalize(m * vec3(0.0, 1.0, 0.0));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,q=`
uniform sampler2D uMap;
uniform float uTime;
uniform vec3 uBaseA;
uniform vec3 uBaseB;
uniform vec3 uText;
uniform vec3 uEdge;
uniform vec3 uChip;
uniform float uTextFoil;
uniform float uFoil;
uniform float uGlitter;
uniform float uGlitterAll;
uniform vec3 uPa;
uniform vec3 uPb;
uniform vec3 uPc;
uniform vec3 uPd;
uniform vec3 uPat;
uniform float uLight;
varying vec2 vUv;
varying vec3 vWPos;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;

const float ASP = 1.5873;

vec3 hash3(vec2 p) {
  vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)));
  return fract(sin(q) * 43758.5453);
}

vec3 film(float t) { return uPa + uPb * cos(6.28318 * (uPc * t + uPd)); }

// emboss micro-pattern in card space (x: -ASP/2..ASP/2, y: -.5...5)
float pattern(vec2 p) {
  vec2 c1 = vec2(0.26, 0.12);
  vec2 c2 = vec2(0.30, 0.05);
  float rings = 0.5 + 0.5 * sin(length(p - c1) * 150.0) * sin(length(p - c2) * 150.0 + 1.0);
  vec2 d = p - vec2(0.26, 0.11);
  float rays = 0.5 + 0.5 * sin(atan(d.y, d.x) * 56.0 + sin(length(d) * 40.0) * 0.6);
  vec2 g = vec2(p.x + p.y, p.x - p.y) * 34.0;
  vec2 f = abs(fract(g) - 0.5);
  float lat = smoothstep(0.08, 0.0, min(f.x, f.y));
  return dot(uPat, vec3(rings, rays, lat));
}

void main() {
  vec4 m = texture2D(uMap, vUv);
  vec2 p = (vUv - 0.5) * vec2(ASP, 1.0);
  vec3 V = normalize(cameraPosition - vWPos);
  vec3 N0 = normalize(vN);
  vec3 T = normalize(vT);
  vec3 B = normalize(vB);
  vec3 vt = vec3(dot(V, T), dot(V, B), dot(V, N0));

  // ---- bump: baked emboss (alpha) + procedural pattern inside the foil
  float pat = pattern(p);
  #ifndef BACK
  vec2 e = vec2(1.0 / 1600.0, 1.0 / 1008.0) * 1.5;
  float hx = texture2D(uMap, vUv + vec2(e.x, 0.0)).a - texture2D(uMap, vUv - vec2(e.x, 0.0)).a;
  float hy = texture2D(uMap, vUv + vec2(0.0, e.y)).a - texture2D(uMap, vUv - vec2(0.0, e.y)).a;
  float px1 = pattern(p + vec2(0.0012, 0.0)) - pattern(p - vec2(0.0012, 0.0));
  float py1 = pattern(p + vec2(0.0, 0.0012)) - pattern(p - vec2(0.0, 0.0012));
  float foilMask = m.g;
  vec3 N = normalize(N0 - T * (hx * 2.4 + px1 * 0.05 * foilMask) - B * (hy * 2.4 + py1 * 0.05 * foilMask));
  float h = m.a;
  #else
  float foilMask = m.g;
  vec3 N = N0;
  float h = 0.0;
  #endif

  vec3 L1 = normalize(vec3(-0.45, 0.7, 0.9));
  vec3 L2 = normalize(vec3(0.75, -0.25, 0.75));
  vec3 R = reflect(-V, N);
  float s1 = max(dot(R, L1), 0.0);
  float s2 = max(dot(R, L2), 0.0);
  // soft studio "environment": bright from above, a dim floor
  float env = smoothstep(-0.5, 0.9, R.y) * 0.55 + pow(s1, 6.0) * 0.6 + pow(s2, 10.0) * 0.3;

  // ---- thin-film hue: shifts with the viewing angle across the card, the emboss and the pattern
  float t = vt.x * 1.7 + vt.y * 1.2 + dot(p, vec2(0.55, -0.4)) + h * 0.45 + pat * 0.05 + uTime * 0.015;
  vec3 foil = film(t);

  // a specular sweep band that slides across as the card tilts
  float sweepPos = 0.5 + vt.x * 2.4 - vt.y * 1.6 + sin(uTime * 0.3) * 0.08;
  float sweep = exp(-pow((dot(vUv - 0.5, normalize(vec2(1.0, 0.62))) + 0.5 - sweepPos) / 0.1, 2.0));

  // ---- base stock
  vec3 base = mix(uBaseA, uBaseB, smoothstep(-0.7, 0.8, p.x * 0.55 + p.y * 0.9));
  base *= 0.95 + 0.05 * pat;
  float diff = 0.78 + 0.22 * max(dot(N, L1), 0.0);
  vec3 col = base * diff;

  // ---- foil
  float fm = clamp(foilMask * uFoil, 0.0, 1.0);
  vec3 foilC = foil * (0.32 + 0.95 * env) + foil * sweep * 0.75;
  foilC *= 0.9 + 0.1 * pat;
  col = mix(col, foilC, fm);

  // ---- glitter flakes: each cell has its own tilted micro-normal, so they light up one by one
  vec2 gp = vUv * vec2(210.0, 132.0);
  vec2 gi = floor(gp);
  vec3 rnd = hash3(gi);
  vec2 gf = fract(gp) - 0.5 - (rnd.xy - 0.5) * 0.5;
  float flake = smoothstep(0.3, 0.02, length(gf));
  vec3 fn = normalize(N + T * (rnd.x - 0.5) * 1.1 + B * (rnd.y - 0.5) * 1.1);
  vec3 Rf = reflect(-V, fn);
  float tw = pow(max(dot(Rf, L1), 0.0), 90.0) + pow(max(dot(Rf, L2), 0.0), 120.0) * 0.7;
  float glit = tw * flake * step(0.5, rnd.z) * (fm * uGlitter + uGlitterAll);
  col += glit * (film(t + rnd.z * 0.6) * 1.6 + 0.6) * 2.2;

  #ifndef BACK
  // ---- chip (brushed metal, contacts separated by dark gaps)
  float chipM = smoothstep(0.2, 0.35, m.b);
  float gap = 1.0 - smoothstep(0.55, 0.85, m.b);
  float brush = 0.92 + 0.08 * sin(vUv.x * 900.0 + sin(vUv.y * 40.0) * 2.0);
  vec3 chipC = uChip * (0.45 + 0.75 * env) * brush + pow(s1, 30.0) * 0.6;
  chipC = mix(chipC, uChip * 0.25, gap * 0.85);
  col = mix(col, chipC, chipM);
  #else
  // ---- magnetic stripe, signature panel, cvv box
  float stripe = m.a;
  vec3 stripeC = vec3(0.025, 0.025, 0.03) + pow(s1, 14.0) * 0.18 + env * 0.03;
  col = mix(col, stripeC, stripe);
  float panel = smoothstep(0.8, 0.95, m.b);
  float cvvBox = smoothstep(0.35, 0.5, m.b) * (1.0 - panel);
  vec2 sp = vUv * vec2(260.0, 164.0);
  float wav = 0.5 + 0.5 * sin((sp.x + sp.y) * 1.7);
  vec3 panelC = mix(vec3(0.93, 0.92, 0.88), vec3(0.83, 0.85, 0.9), wav * 0.5) * (0.85 + 0.2 * env);
  col = mix(col, panelC, panel);
  col = mix(col, vec3(0.9, 0.9, 0.9) * (0.85 + 0.2 * env), cvvBox * 0.9);
  #endif

  // ---- printed text (foil-stamped in some styles); on the signature panel it is blue-black ink
  vec3 txt = mix(uText * (0.85 + 0.25 * env), foil * (0.55 + 0.9 * env) + sweep * 0.3, uTextFoil);
  #ifdef BACK
  txt = mix(txt, vec3(0.08, 0.1, 0.2), max(panel, cvvBox));
  #endif
  col = mix(col, txt, m.r);

  // ---- clear coat: tight key highlight + broad sheen
  float fres = pow(1.0 - clamp(vt.z, 0.0, 1.0), 4.0);
  col += pow(s1, 80.0) * 0.55 + pow(s1, 8.0) * 0.06 * (0.4 + uLight) + sweep * 0.06 + fres * 0.12;

  gl_FragColor = vec4(pow(max(col, 0.0), vec3(2.2)), 1.0);
  #include <colorspace_fragment>
}
`,J=`
varying vec3 vWN;
varying vec3 vWPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vWN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,Y=`
uniform vec3 uEdge;
varying vec3 vWN;
varying vec3 vWPos;
void main() {
  vec3 N = normalize(vWN);
  vec3 V = normalize(cameraPosition - vWPos);
  vec3 R = reflect(-V, N);
  float env = smoothstep(-0.4, 0.9, R.y);
  vec3 col = uEdge * (0.35 + 0.75 * env) + pow(max(dot(R, normalize(vec3(-0.45, 0.7, 0.9))), 0.0), 40.0) * 0.5;
  gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
  #include <colorspace_fragment>
}
`,X=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`,re=`
uniform vec2 uSize;
uniform vec2 uPlane;
uniform float uBlur;
uniform float uOpacity;
varying vec2 vUv;
float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = (vUv - 0.5) * uPlane;
  float d = sdRound(p, uSize * 0.5, 0.18);
  float a = 1.0 - smoothstep(-uBlur * 0.6, uBlur, d);
  a *= a;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * uOpacity);
}
`,ie=`
uniform vec3 uColor;
uniform float uAmt;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float g = exp(-dot(p, p) * 3.2) * smoothstep(1.0, 0.55, length(p));
  gl_FragColor = vec4(pow(uColor, vec3(2.2)) * g * uAmt, 1.0);
  #include <colorspace_fragment>
}
`,ae=`
uniform vec2 uC;
varying vec2 vUv;
void main() {
  vec2 p = vUv - uC;
  p.x *= 1.6;
  float g = exp(-dot(p, p) * 2.6);
  vec3 col = mix(vec3(0.035, 0.035, 0.055), vec3(0.09, 0.09, 0.13), g);
  gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
  #include <colorspace_fragment>
}
`,Z=3.4,Q=Z/1.5873,$=.014,oe=.03;function se(e,t,n){let r=new l,i=-e/2,a=-t/2;return r.moveTo(i+n,a),r.lineTo(i+e-n,a),r.absarc(i+e-n,a+n,n,-Math.PI/2,0,!1),r.lineTo(i+e,a+t-n),r.absarc(i+e-n,a+t-n,n,0,Math.PI/2,!1),r.lineTo(i+n,a+t),r.absarc(i+n,a+t-n,n,Math.PI/2,Math.PI,!1),r.lineTo(i,a+n),r.absarc(i+n,a+n,n,Math.PI,Math.PI*1.5,!1),r}function ce(){return(0,D.useMemo)(()=>{let e=Z-$*2,t=Q-$*2,n=se(e,t,.126),r=new c(n,{depth:oe,bevelEnabled:!0,bevelThickness:$,bevelSize:$,bevelSegments:5,curveSegments:14});r.translate(0,0,-.03/2);let i=new u(n,14),a=i.attributes.position,o=i.attributes.uv;for(let n=0;n<a.count;n++)o.setXY(n,a.getX(n)/e+.5,a.getY(n)/t+.5);return o.needsUpdate=!0,{body:r,face:i,z:.0305}},[])}function le({springs:e,tiltT:t,target:n,mixK:r,from:i,to:a,onFlip:o,layoutRef:s}){let{body:c,face:l,z:u}=ce(),f=(0,D.useMemo)(()=>ne(),[]),h=(0,D.useMemo)(()=>H(),[]);(0,D.useEffect)(()=>()=>{f.dispose(),h.dispose(),c.dispose(),l.dispose()},[f,h,c,l]);let g=(0,D.useMemo)(()=>({uTime:{value:0},uBaseA:{value:new d},uBaseB:{value:new d},uText:{value:new d},uEdge:{value:new d},uChip:{value:new d},uTextFoil:{value:0},uFoil:{value:1},uGlitter:{value:1},uGlitterAll:{value:0},uPa:{value:new d},uPb:{value:new d},uPc:{value:new d},uPd:{value:new d},uPat:{value:new d},uLight:{value:0}}),[]),y=E(()=>({vertexShader:K,fragmentShader:q,uniforms:{...g,uMap:{value:f}}})),b=E(()=>({vertexShader:K,fragmentShader:q,uniforms:{...g,uMap:{value:h}},defines:{BACK:``}})),S=E(()=>({vertexShader:J,fragmentShader:Y,uniforms:{uEdge:g.uEdge}})),C=(0,D.useMemo)(()=>({uSize:{value:new p(Z,Q)},uPlane:{value:new p(9,7)},uBlur:{value:.5},uOpacity:{value:.9}}),[]),w=E(()=>({vertexShader:X,fragmentShader:re,uniforms:C,transparent:!0,depthWrite:!1})),T=(0,D.useMemo)(()=>({uColor:{value:new d(.6,.9,1)},uAmt:{value:.2}}),[]),O=E(()=>({vertexShader:X,fragmentShader:ie,uniforms:T,transparent:!0,blending:2,depthWrite:!1})),k=(0,D.useMemo)(()=>({uC:{value:new p(.65,.5)}}),[]),A=E(()=>({vertexShader:X,fragmentShader:ae,uniforms:k,depthWrite:!1})),j=(0,D.useRef)(null),M=(0,D.useRef)(null),N=(0,D.useRef)(null),P=(0,D.useRef)(null),F=(0,D.useRef)(null),I=(0,D.useRef)(0),L=(0,D.useRef)(a.current.slice()),R=m(e=>e.size),z=m(e=>e.camera),B=(0,D.useMemo)(()=>{let e=R.width,t=R.height,n=t/(2*z.position.z*Math.tan(v.degToRad(z.fov/2))),r,i,a;return x?(r=e/2,i=t/2,a=Math.min(e*.46,t*.95)):e<760?(a=Math.min(e*.8,360),r=e/2,i=Math.max(72+a*.42,t*.355)):(a=Math.min(Math.max(e*.36,380),600,t*.95),r=e*(e>1100?.665:.68),i=t*.49),{x:(r-e/2)/n,y:-(i-t/2)/n,s:a/(Z*n),cx:r,cy:i,px:a,bgx:r/e,bgy:1-i/t}},[R,z]);return(0,D.useEffect)(()=>{s.current={cx:B.cx,cy:B.cy,px:B.px},k.uC.value.set(B.bgx,B.bgy)},[B,s,k]),_((o,s)=>{I.current+=Math.min(s,1/30);let c=I.current,l=n.current;x?(t.rx.set(-.1),t.ry.set(-.36)):l.active>0?(t.rx.set(l.y*.34),t.ry.set(l.x*.46)):(t.rx.set(Math.sin(c*.47)*.13-.04),t.ry.set(Math.sin(c*.31+1)*.34));let u=r.get(),d=i.current,f=a.current,p=L.current;for(let e=0;e<p.length;e++)p[e]=d[e]+(f[e]-d[e])*u;g.uBaseA.value.set(p[0],p[1],p[2]),g.uBaseB.value.set(p[3],p[4],p[5]),g.uText.value.set(p[6],p[7],p[8]),g.uEdge.value.set(p[9],p[10],p[11]),g.uChip.value.set(p[12],p[13],p[14]),g.uTextFoil.value=p[15],g.uFoil.value=p[16],g.uGlitter.value=p[17],g.uGlitterAll.value=p[18],g.uPa.value.set(p[19],p[20],p[21]),g.uPb.value.set(p[22],p[23],p[24]),g.uPc.value.set(p[25],p[26],p[27]),g.uPd.value.set(p[28],p[29],p[30]),g.uPat.value.set(p[31],p[32],p[33]),g.uLight.value=p[34],T.uColor.value.set(p[35],p[36],p[37]),g.uTime.value=c;let m=e.rx.get(),h=e.ry.get(),_=e.flip.get();if(M.current&&M.current.rotation.set(m,h,0),N.current){let t=Math.sin(Math.min(Math.max(_/Math.PI,0),1)*Math.PI);N.current.rotation.y=_+e.wob.get(),N.current.position.z=t*.5}let v=h+_,y=Math.max(.08,Math.abs(Math.cos(v)))*.94,b=Math.max(.3,Math.abs(Math.cos(m)))*.86;C.uSize.value.set(Z*y,Q*b),P.current&&P.current.position.set(-h*.5,-.38+m*.3,-.9),T.uAmt.value=.1+.12*(.5+.5*Math.sin(v*2.4+m*3)),F.current&&F.current.position.set(h*.8,-m*.5,-1.4)}),(0,U.jsxs)(U.Fragment,{children:[(0,U.jsx)(`mesh`,{position:[0,0,-6],scale:[60,40,1],material:A,children:(0,U.jsx)(`planeGeometry`,{})}),(0,U.jsxs)(`group`,{ref:j,position:[B.x,B.y,0],scale:B.s,children:[(0,U.jsx)(`mesh`,{ref:F,material:O,scale:[9,7,1],children:(0,U.jsx)(`planeGeometry`,{})}),(0,U.jsx)(`mesh`,{ref:P,material:w,scale:[9,7,1],children:(0,U.jsx)(`planeGeometry`,{})}),(0,U.jsx)(`group`,{ref:M,children:(0,U.jsxs)(`group`,{ref:N,onClick:e=>{e.stopPropagation(),o()},onPointerOver:()=>document.body.style.cursor=`pointer`,onPointerOut:()=>document.body.style.cursor=``,children:[(0,U.jsx)(`mesh`,{geometry:c,material:S}),(0,U.jsx)(`mesh`,{geometry:l,material:y,position:[0,0,u]}),(0,U.jsx)(`mesh`,{geometry:l,material:b,position:[0,0,-u],rotation:[0,Math.PI,0]})]})})]})]})}function ue(){let[e,t]=(0,D.useState)(0),[n,s]=(0,D.useState)(!1),c=a(0),l=a(0),u=i(c,{stiffness:110,damping:13,mass:.9}),d=i(l,{stiffness:110,damping:13,mass:.9}),f=a(0),p=a(0),m=(0,D.useMemo)(()=>({rx:c,ry:l}),[c,l]),h=(0,D.useMemo)(()=>({rx:u,ry:d,flip:f,wob:p}),[u,d,f,p]),g=(0,D.useRef)({x:0,y:0,active:0}),_=(0,D.useRef)({cx:0,cy:0,px:1}),v=a(1),y=(0,D.useRef)(G(W[0])),x=(0,D.useRef)(G(W[0])),T=(0,D.useRef)(!0);return(0,D.useEffect)(()=>{if(T.current){T.current=!1;return}let t=v.get();y.current=y.current.map((e,n)=>e+(x.current[n]-e)*t),x.current=G(W[e]),v.set(0);let n=r(v,1,{duration:.9,ease:[.45,0,.2,1]});p.set(.55);let i=r(p,0,{type:`spring`,stiffness:90,damping:8});return()=>{n.stop(),i.stop()}},[e,v,p]),(0,D.useEffect)(()=>{let e=r(f,n?Math.PI:0,{type:`spring`,stiffness:60,damping:11,mass:1});return()=>e.stop()},[n,f]),(0,D.useEffect)(()=>{let e=0,t=t=>{let n=_.current,r=n.px*.62;g.current.x=Math.max(-1,Math.min(1,(t.clientX-n.cx)/r)),g.current.y=Math.max(-1,Math.min(1,(t.clientY-n.cy)/r)),g.current.active=1,clearTimeout(e),e=window.setTimeout(()=>g.current.active=0,2600)},n=()=>{clearTimeout(e),g.current.active=0};return window.addEventListener(`pointermove`,t),document.documentElement.addEventListener(`pointerleave`,n),()=>{clearTimeout(e),window.removeEventListener(`pointermove`,t),document.documentElement.removeEventListener(`pointerleave`,n),document.body.style.cursor=``}},[]),(0,U.jsxs)(`div`,{className:`stage`,style:{background:`#0b0b12`},children:[(0,U.jsx)(`style`,{children:de}),(0,U.jsxs)(b,{dpr:[1,2],camera:{position:[0,0,8],fov:30},gl:{antialias:!0,alpha:!1},children:[(0,U.jsx)(`color`,{attach:`background`,args:[`#0b0b12`]}),(0,U.jsx)(le,{springs:h,tiltT:m,target:g,mixK:v,from:y,to:x,onFlip:()=>s(e=>!e),layoutRef:_}),(0,U.jsx)(C,{multisampling:4,children:(0,U.jsx)(w,{mipmapBlur:!0,intensity:.55,luminanceThreshold:.82,luminanceSmoothing:.2,radius:.55})})]}),(0,U.jsxs)(`div`,{className:`overlay`,children:[(0,U.jsx)(`div`,{className:`hero-copy hc-copy`,children:(0,U.jsxs)(o.div,{initial:{opacity:0,y:14,filter:`blur(6px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},transition:{duration:.8,delay:.1,ease:[.23,1,.32,1]},children:[(0,U.jsxs)(`p`,{className:`kicker`,children:[(0,U.jsx)(`i`,{style:{background:W[e].bg,boxShadow:`0 0 10px ${W[e].bg}`}}),`Holo Foil · Membership`]}),(0,U.jsxs)(`h1`,{children:[`会员卡，`,(0,U.jsx)(`br`,{}),`也可以是一件收藏品`]}),(0,U.jsx)(`p`,{children:`镭射箔随视角流转出彩虹色带，闪粉在转动时一粒粒亮起。移动指针让卡片倾斜，点一下翻到背面。`}),(0,U.jsxs)(`div`,{className:`hero-actions`,children:[(0,U.jsx)(`button`,{className:`btn primary`,children:`申领会员卡`}),(0,U.jsx)(`button`,{className:`btn`,onClick:()=>s(e=>!e),children:n?`翻回正面`:`翻到背面`})]})]})}),(0,U.jsx)(`div`,{className:`dock`,children:(0,U.jsx)(S,{items:W.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:t})}),(0,U.jsx)(`p`,{className:`hint`,children:`移动指针倾斜 · 点击卡片翻面`})]})]})}var de=`
.hc-copy h1 { font-size: clamp(32px, 3.4vw, 50px); }
.hc-copy .kicker i { transition: background .6s, box-shadow .6s; }
@media (max-width: 760px) {
  .hc-copy h1 { font-size: 32px; }
  .hc-copy p { font-size: 14.5px; line-height: 1.65; margin-top: 14px; }
  .hc-copy .hero-actions { margin-top: 20px; }
}
`;export{ue as default};