import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{n as a,r as o}from"./index-gQ65n0JU.js";import{E as s,Lt as c,M as l,P as u,Rt as d,T as f,Xt as p,bn as m,dn as h,h as g,nn as _,q as v,rt as y,u as b,vn as x,wt as S,xt as C,yn as w,z as T}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as E}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as D}from"./iso-CLB38p39.js";import{t as O}from"./Seg-CH5KfWEm.js";import{t as k}from"./glsl-oFfHlTlN.js";var A=e(t(),1);function j(e){let t=(e,t,n,r)=>{let i=(e-t)/(e<t?n:r);return Math.exp(-.5*i*i)},n=1.056*t(e,599.8,37.9,31)+.362*t(e,442,16,26.7)-.065*t(e,501.1,20.4,26.2),r=.821*t(e,568.8,46.9,40.5)+.286*t(e,530.9,16.3,31.1),i=1.217*t(e,437,11.8,36)+.681*t(e,459,26,13.8);return[3.2406*n-1.5372*r-.4986*i,-.9689*n+1.8758*r+.0415*i,.0557*n-.204*r+1.057*i]}function M(){let e=[],t=[],n=[0,0,0];for(let r=0;r<16;r++){let i=400+300*r/15,a=j(i);e.push(i),t.push(a);for(let e=0;e<3;e++)n[e]+=a[e]}return`
vec3 filmRGB(float d, float F, float ct) {
  float k = 16.7133 * d * ct;
  float A = 2.0 * F;
  float B = 1.0 + F * F;
  vec3 acc = vec3(0.0);
  float c;
${e.map((e,r)=>{let i=t[r].map((e,t)=>(e/n[t]).toFixed(5));return`  c = cos(k * ${(1/e).toFixed(7)}); acc += vec3(${i.join(`, `)}) * ((A - A * c) / (B - A * c));`}).join(`
`)}
  return max(acc, 0.0);
}
`}var N=`
float rrect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// local panel coords (x right, y up, on the plane 1 unit along ax); w = 0 behind the viewer
vec3 panelQ(vec3 d, vec3 ax) {
  float t = dot(d, ax);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), ax));
  vec3 up = cross(ax, rt);
  return vec3(vec2(dot(d, rt), dot(d, up)) / max(t, 1e-3), step(0.05, t));
}
vec3 env(vec3 d) {
  float y = d.y;
  vec3 c = mix(vec3(0.006, 0.007, 0.012), vec3(0.022, 0.026, 0.040), smoothstep(-0.4, 0.8, y));
  // dim fill wall behind the camera (what the middle of each bubble mirrors)
  c += vec3(0.030, 0.034, 0.046) * smoothstep(-0.2, 0.9, d.z) * smoothstep(-0.7, 0.2, y);
  // key: a tall three-light studio window (vertical mullions only, so the reflection never reads as a logo),
  // up-left, behind the camera
  vec3 q = panelQ(d, normalize(vec3(-0.52, 0.5, 0.69)));
  float s = rrect(q.xy, vec2(0.5, 0.64), 0.1);
  float win = (1.0 - smoothstep(-0.015, 0.015, s)) * q.z;
  float mull = smoothstep(0.01, 0.026, abs(abs(q.x) - 0.17));
  float grad = 0.75 + 0.25 * smoothstep(-0.5, 0.5, q.y);
  c += vec3(2.1, 2.05, 1.95) * win * mull * grad;
  // tall strip light on the right
  q = panelQ(d, normalize(vec3(0.82, 0.12, 0.56)));
  s = rrect(q.xy, vec2(0.075, 0.62), 0.05);
  c += vec3(0.85, 1.0, 1.3) * (1.0 - smoothstep(-0.02, 0.02, s)) * q.z;
  // cool rim light behind-left (shows on the bubble edges)
  q = panelQ(d, normalize(vec3(-0.75, 0.25, -0.62)));
  s = rrect(q.xy, vec2(0.3, 0.7), 0.2);
  c += vec3(0.25, 0.55, 0.95) * 0.7 * (1.0 - smoothstep(-0.25, 0.25, s)) * q.z;
  // overhead softbox (lights the tops and the wand's film)
  q = panelQ(d, normalize(vec3(0.15, 1.0, -0.2)));
  s = rrect(q.xy, vec2(0.5, 0.3), 0.12);
  c += vec3(0.9, 0.95, 1.05) * (1.0 - smoothstep(-0.06, 0.06, s)) * q.z;
  // warm bounce from below, faint magenta practical behind-right
  c += vec3(0.16, 0.10, 0.06) * smoothstep(-0.15, -0.75, y);
  q = panelQ(d, normalize(vec3(0.6, -0.15, -0.78)));
  c += vec3(0.75, 0.25, 0.55) * 0.5 * exp(-dot(q.xy, q.xy) * 6.0) * q.z;
  return c;
}
`,P=`
uniform float uTime;
uniform float uThick;
uniform float uGain;
${k}
${N}
${M()}

float filmThickness(vec3 p, float drain, float seed, float t) {
  float a = t * 0.16 + p.y * 1.3 + seed;
  float ca = cos(a), sa = sin(a);
  vec3 q = vec3(ca * p.x - sa * p.z, p.y, sa * p.x + ca * p.z);
  vec3 w = vec3(snoise(q * 1.25 + vec3(seed, t * 0.09, 0.0)), snoise(q * 1.25 + vec3(5.2, 1.3 - t * 0.07, seed)), 0.0);
  q += w * 0.42;
  float n = snoise(q * 2.3 + vec3(0.0, -t * 0.16, seed * 0.7));
  float y = p.y + w.x * 0.16 + n * 0.05;
  float s = clamp(0.5 - 0.5 * y, 0.0, 1.0);
  float top = mix(380.0, 30.0, smoothstep(0.0, 0.85, drain));
  float bot = mix(700.0, 1050.0, drain);
  float d = mix(top, bot, pow(s, mix(0.9, 1.7, drain)));
  d += n * mix(150.0, 95.0, drain) * (0.35 + s);
  // black film: sharp-edged, mottled, spreading down from the top late in life
  float bf = smoothstep(0.5, 0.56, (1.0 - s) * drain * 1.15 + 0.2 * snoise(q * 3.1 + vec3(0.0, t * 0.25, seed)));
  d = mix(d, 9.0, bf);
  return max(d, 0.0);
}

`,F=`
uniform float uTime;
uniform float uWob;
uniform float uSeed;
uniform vec4 uSquash;
uniform vec4 uPlaneA;
uniform vec4 uPlaneB;
uniform float uPop;
varying vec3 vLocal;
varying vec3 vNw;
varying vec3 vPw;
${k}
vec3 deform(vec3 p) {
  float n = snoise(p * 0.8 + vec3(uSeed, uTime * 0.42, uTime * 0.31));
  n += 0.15 * snoise(p * 1.7 + vec3(uTime * 0.63, uSeed, 0.0));
  vec3 q = p * (1.0 + uWob * n);
  vec3 ax = uSquash.xyz;
  float s = dot(q, ax);
  q += ax * s * (-uSquash.w) + (q - ax * s) * (uSquash.w * 0.5);
  // a neighbour's shared wall: flatten everything beyond the contact plane
  q -= uPlaneA.xyz * max(dot(q, uPlaneA.xyz) - uPlaneA.w, 0.0);
  q -= uPlaneB.xyz * max(dot(q, uPlaneB.xyz) - uPlaneB.w, 0.0);
  return q * (1.0 - 0.05 * uPop);
}
void main() {
  vec3 p = normalize(position);
  vec3 t = normalize(cross(p, abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(p, t);
  float e = 0.025;
  vec3 d0 = deform(p);
  vec3 d1 = deform(normalize(p + t * e));
  vec3 d2 = deform(normalize(p + b * e));
  vec3 nrm = normalize(cross(d1 - d0, d2 - d0));
  vLocal = p;
  vec4 wp = modelMatrix * vec4(d0, 1.0);
  vPw = wp.xyz;
  vNw = normalize(mat3(modelMatrix) * nrm);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,I=`
uniform float uRad;
varying vec3 vLocal;
varying vec3 vNw;
varying vec3 vPw;
void main() {
  vec2 l = position.xy / uRad;
  vLocal = vec3(l, sqrt(max(1.0 - dot(l, l), 0.0)) * 0.4);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPw = wp.xyz;
  vNw = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,L=`
uniform float uSeed;
uniform float uDrain;
uniform float uPop;
uniform float uFade;
uniform vec3 uPopDir;
varying vec3 vLocal;
varying vec3 vNw;
varying vec3 vPw;
${P}
void main() {
  vec3 p = vLocal;
  float rim = 0.0;
  if (uPop > 0.0) {
    // the film tears open from the poke and retracts; the gathered rim is thick (white) and ragged
    float ang = acos(clamp(dot(normalize(p), uPopDir), -1.0, 1.0)) / 3.14159265;
    float jag = snoise(p * 5.0 + uSeed) * 0.08 + snoise(p * 16.0 - uSeed) * 0.035;
    float edge = uPop * 1.2 + jag - 0.1;
    if (ang < edge) discard;
    rim = 1.0 - smoothstep(0.0, 0.07, ang - edge);
  }
  vec3 n = normalize(vNw);
  // three flips the winding for BackSide, so gl_FrontFacing is true there: use its define instead
#if defined(FLIP_SIDED)
  n = -n;
#elif defined(DOUBLE_SIDED)
  if (!gl_FrontFacing) n = -n;
#endif
  vec3 v = normalize(cameraPosition - vPw);
  float ci = clamp(dot(n, v), 0.0, 1.0);
  float F = min(0.02 + 0.98 * pow(1.0 - ci, 5.0), 0.985);
  float st = sqrt(1.0 - ci * ci) / 1.33;
  float ct = sqrt(1.0 - st * st);
  float d = filmThickness(p, uDrain, uSeed, uTime) * uThick;
  vec3 R = filmRGB(d, F, ct);
  vec3 L = env(reflect(-v, n));
  vec3 col = R * L * uGain;
  float a = clamp(dot(R, vec3(0.3333)), 0.0, 1.0);
  col += rim * vec3(0.8, 0.9, 1.0) * 1.1;
  a = max(a, rim * 0.75);
  col = 1.0 - exp(-col * 1.1);
  col = pow(col, vec3(1.0 / 2.2));
  gl_FragColor = vec4(col * uFade, a * uFade);
}
`,R=`
varying vec3 vNw;
varying vec3 vPw;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPw = wp.xyz;
  vNw = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,ee=`
uniform vec3 uColor;
varying vec3 vNw;
varying vec3 vPw;
${N}
void main() {
  vec3 n = normalize(vNw);
  vec3 v = normalize(cameraPosition - vPw);
  vec3 key = normalize(vec3(-0.52, 0.5, 0.69));
  float dif = max(dot(n, key), 0.0);
  float wrap = max(dot(n, normalize(vec3(0.8, 0.1, 0.5))), 0.0);
  vec3 col = uColor * (0.06 + dif * 0.75 + wrap * 0.18 + max(-n.y, 0.0) * 0.05);
  float fr = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
  col += env(reflect(-v, n)) * fr * 0.9;
  // subsurface-ish glow on the thin plastic
  col += uColor * 0.12 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.0);
  col = 1.0 - exp(-col * 1.1);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`,te=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }
`,ne=`
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uSpread;
uniform float uTime;
varying vec2 vUv;
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float asp = uRes.x / uRes.y;
  vec2 p = vec2((vUv.x - 0.5) * asp, vUv.y - 0.5);
  vec3 c = mix(vec3(0.0025, 0.003, 0.0055), vec3(0.008, 0.010, 0.018), smoothstep(-0.55, 0.5, p.y));
  vec2 cc = uCenter;
  c += vec3(0.008, 0.016, 0.030) * exp(-dot(p - cc, p - cc) * 4.0 / (uSpread * uSpread));
  c += vec3(0.012, 0.008, 0.010) * exp(-dot(p - cc - vec2(0.0, -0.45 * uSpread), p - cc - vec2(0.0, -0.45 * uSpread)) * 9.0 / (uSpread * uSpread));
  // bokeh: soft discs with a slightly brighter rim (lens look)
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    vec2 o = vec2(h11(fi + 1.3) - 0.5, h11(fi + 7.9) - 0.42) * vec2(1.7, 1.15) * uSpread;
    o += 0.02 * vec2(sin(uTime * 0.11 + fi * 2.1), cos(uTime * 0.09 + fi * 1.3));
    float r = (0.025 + 0.075 * h11(fi + 3.7)) * uSpread;
    float d = length(p - cc - o);
    float disc = 1.0 - smoothstep(r * 0.86, r, d);
    disc *= 0.7 + 0.3 * smoothstep(r * 0.4, r * 0.95, d);
    float k = h11(fi + 11.1);
    vec3 col = k < 0.33 ? vec3(1.0, 0.62, 0.32) : k < 0.66 ? vec3(0.35, 0.75, 1.0) : vec3(0.85, 0.45, 0.95);
    c += col * disc * (0.006 + 0.022 * h11(fi + 5.5));
  }
  vec2 sv = vUv - 0.5;
  c *= 1.0 - dot(sv, sv) * 0.9;
  c = pow(c, vec3(1.0 / 2.2));
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`,re=`
attribute float aA;
attribute float aS;
uniform float uPx;
varying float vA;
void main() {
  vA = aA;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aS * uPx / -mv.z;
  if (aA <= 0.0) gl_PointSize = 0.0;
  gl_Position = projectionMatrix * mv;
}
`,ie=`
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q) * 2.0;
  if (d > 1.0) discard;
  float body = 1.0 - smoothstep(0.55, 1.0, d);
  float hi = exp(-dot(q - vec2(-0.14, -0.14), q - vec2(-0.14, -0.14)) * 90.0);
  vec3 col = vec3(0.55, 0.75, 0.95) * body * 0.35 + vec3(1.0) * hi * 0.9;
  float a = body * 0.35 * vA;
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)) * vA, a);
}
`,z=n(),B=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,V=9,H=700,U={x0:-3,x1:3,y0:-1.85,y1:2.7,z0:-1.1,z1:1.1},W=new w(.35,-2.55,.25),G=new w(.1,.78,.62).normalize(),K=.56,q=.26,J=.42,Y=[{v:.55,label:`薄`,note:`膜更薄：一级干涉的金、品红、靛蓝最浓，顶部很快出现黑膜`},{v:1,label:`中`,note:`几百纳米：上薄下厚，颜色一圈圈从品红过渡到青绿`},{v:1.75,label:`厚`,note:`膜更厚：高级次干涉叠在一起，颜色变得粉绿、柔和`}],X=(e,t)=>e+Math.random()*(t-e),Z=e=>1-(1-e)**3;function Q({thick:e,wind:t,blowReq:n,onPop:r,onReady:i}){let a=g(e=>e.gl),o=g(e=>e.scene),E=g(e=>e.camera),O=g(e=>e.size),k=(0,A.useMemo)(()=>{let e={uTime:{value:0},uThick:{value:1},uGain:{value:2}},t=new _(1,B?64:88,B?44:60),n=new y,r=(e,t)=>new p({vertexShader:F,fragmentShader:L,uniforms:e,transparent:!0,premultipliedAlpha:!0,blending:1,depthWrite:!1,side:t}),i=[];for(let a=0;a<V;a++){let o={...e,uWob:{value:.03},uSeed:{value:Math.random()*50},uDrain:{value:0},uPop:{value:0},uFade:{value:1},uSquash:{value:new m(0,1,0,0)},uPlaneA:{value:new m(1,0,0,10)},uPlaneB:{value:new m(1,0,0,10)},uPopDir:{value:new w(0,1,0)}},s=new S(t,r(o,1)),c=new S(t,r(o,0));c.userData.slot=a,s.raycast=()=>{},n.add(s,c),i.push({on:!1,phase:1,t:0,p:new w,v:new w,r:.7,rT:.7,seed:o.uSeed.value,age:0,life:20,sq:0,sqV:0,sqT:0,ax:new w(0,1,0),into:-1,links:0,planes:0,u:o,front:c,back:s})}let a=new y;a.position.copy(W),a.quaternion.setFromUnitVectors(new w(0,0,1),G);let o=new p({vertexShader:R,fragmentShader:ee,uniforms:{uColor:{value:new u(`#ff7f9e`)}}}),g=new h(.6000000000000001,.05,16,96),b=new S(g,o),C=new T(.055,.07,3.4,20),E=new S(C,o);E.position.set(.08,-2.31,-.02),E.rotation.z=.045;let D={...e,uRad:{value:K},uSeed:{value:3.3},uDrain:{value:.35},uPop:{value:0},uFade:{value:1},uPopDir:{value:new w(0,1,0)}},O=new l(K,64),k=new S(O,new p({vertexShader:I,fragmentShader:L,uniforms:D,transparent:!0,premultipliedAlpha:!0,depthWrite:!1,side:2}));k.raycast=()=>{},a.add(b,E,k),n.add(a);let A=new s,j=new Float32Array(H*3),M=new Float32Array(H),N=new Float32Array(H);A.setAttribute(`position`,new f(j,3).setUsage(v)),A.setAttribute(`aA`,new f(M,1).setUsage(v)),A.setAttribute(`aS`,new f(N,1).setUsage(v));let P=new p({vertexShader:re,fragmentShader:ie,uniforms:{uPx:{value:400}},transparent:!0,premultipliedAlpha:!0,depthWrite:!1}),z=new d(A,P);z.frustumCulled=!1,z.renderOrder=100,z.raycast=()=>{},n.add(z);let U={pos:j,a:M,s:N,vel:new Float32Array(H*3),life:new Float32Array(H),max:new Float32Array(H),size:new Float32Array(H),head:0},q={uRes:{value:new x(1,1)},uCenter:{value:new x},uSpread:{value:1},uTime:e.uTime},J=new S(new c(2,2),new p({vertexShader:te,fragmentShader:ne,uniforms:q,depthTest:!1,depthWrite:!1}));return J.frustumCulled=!1,J.renderOrder=-100,J.raycast=()=>{},{G:e,sphere:t,root:n,bubs:i,links:[],wand:a,wandMat:o,ringGeo:g,handleGeo:C,discGeo:O,disc:k,discU:D,dropGeo:A,dropMat:P,drops:z,D:U,bg:J,bgU:q}},[]);(0,A.useEffect)(()=>(o.add(k.bg),()=>{o.remove(k.bg)}),[o,k]),(0,A.useEffect)(()=>()=>{k.sphere.dispose(),k.bubs.forEach(e=>{e.front.material.dispose(),e.back.material.dispose()}),k.wandMat.dispose(),k.ringGeo.dispose(),k.handleGeo.dispose(),k.discGeo.dispose(),k.disc.material.dispose(),k.dropGeo.dispose(),k.dropMat.dispose(),k.bg.geometry.dispose(),k.bg.material.dispose()},[k]);let j=(0,A.useMemo)(()=>({t:0,blowT:0,lastBlowReq:0,discFade:1,wobT:0,tmp:new w,tmp2:new w,t1:new w,t2:new w,order:[],ready:!1,readyAt:0}),[]),M=(0,A.useCallback)((e,t,n,r,i,a,o,s)=>{let c=k.D,l=c.head;c.head=(c.head+1)%H,c.pos[l*3]=e,c.pos[l*3+1]=t,c.pos[l*3+2]=n,c.vel[l*3]=r,c.vel[l*3+1]=i,c.vel[l*3+2]=a,c.life[l]=o,c.max[l]=o,c.size[l]=s},[k]),N=(0,A.useCallback)(e=>{let t=k.links;for(let n=t.length-1;n>=0;n--){let r=t[n];if(r.a!==e&&r.b!==e)continue;let i=k.bubs[r.a===e?r.b:r.a];i.links--,i.sqV+=1.6,i.ax.copy(i.p).sub(k.bubs[e].p).normalize(),k.bubs[e].links--,t.splice(n,1)}},[k]),P=(0,A.useCallback)((e,t)=>{let n=k.bubs[e];n.on&&n.phase!==2&&n.phase!==3&&(N(e),n.phase=2,n.t=0,n.u.uPopDir.value.copy(t).normalize(),r())},[k,N,r]),Y=(0,A.useCallback)((e,t,n,r,i)=>{let a=k.bubs.findIndex(e=>!e.on);if(a<0)return-1;let o=k.bubs[a];for(let e=k.links.length-1;e>=0;e--){let t=k.links[e];(t.a===a||t.b===a)&&(k.bubs[t.a===a?t.b:t.a].links--,k.links.splice(e,1))}return o.on=!0,o.phase=1,o.t=0,o.p.set(e,t,n),o.v.set(X(-.1,.1),X(-.05,.1),0),o.r=o.rT=r,o.life=X(17,28),o.age=i*o.life,o.sq=0,o.sqV=X(-.5,.5),o.sqT=0,o.links=0,o.into=-1,o.u.uPop.value=0,o.u.uFade.value=1,a},[k]),Q=(0,A.useCallback)(()=>{if(k.bubs.some(e=>e.on&&e.phase===0))return!1;let e=Y(W.x,W.y,W.z,X(.55,.98),0);if(e<0)return!1;let t=k.bubs[e];return t.phase=0,t.t=0,t.r=.2,t.sqT=-.16,t.ax.copy(G),j.discFade=0,!0},[k,j,Y]);(0,A.useEffect)(()=>{if(k.bubs.forEach(e=>e.on=!1),k.links.length=0,Y(-1.25,.95,.05,.98,.55),Y(.3,1.25,-.1,.72,.32),Y(1.65,-.55,.45,.86,.78),Y(-.85,-1.05,-.55,.58,.12),(!B||D)&&Y(2.15,1.95,-.6,.5,.42),D){k.G.uTime.value=7,Q();let e=k.bubs.find(e=>e.phase===0);e&&(e.t=.72)}},[k,Y,Q]),(0,A.useEffect)(()=>{let e=!1,t=requestAnimationFrame(()=>{if(e)return;let t=k.bubs.map(e=>e.front.visible);k.bubs.forEach(e=>e.front.visible=e.back.visible=!0);let n=a.getRenderTarget();a.setRenderTarget(null);let r=a.compileAsync(o,E);a.setRenderTarget(n),k.bubs.forEach((e,n)=>e.front.visible=e.back.visible=t[n]),r.catch(()=>{}).then(()=>{e||(j.ready=!0,i())})});return()=>{e=!0,cancelAnimationFrame(t)}},[k,j,a,o,E,i]);let $=(0,A.useCallback)(e=>{let t=e.object.userData.slot;if(t===void 0)return;let n=k.bubs[t];if(!n.on||n.phase===2||n.phase===3)return;e.stopPropagation();let r=j.tmp.copy(n.p);k.root.localToWorld(r),P(t,j.tmp2.copy(e.point).sub(r).normalize())},[k,j,P]);return b((r,i)=>{if(!j.ready){a.setRenderTarget(null),a.setClearColor(329484,1),a.clear();return}let s=D?0:Math.min(i,1/30);j.t+=s;let c=k.G;c.uTime.value+=s,c.uThick.value=e.get();let l=t.get(),u=k.bubs,d=O.width,f=O.height,p=r.camera,m=Math.tan(p.fov*Math.PI/360)*p.position.z,h=d/f*m,g,_,v;D?(g=.9,_=0,v=.1):d<760?(g=Math.min(.62,h*.96/3),_=0,v=m*.98-2.75*g-72/f*2*m):(g=Math.min(.95,m/3.6),_=Math.min(h*.42,h-3.25*g),_=Math.max(_,h*.18),v=-.12),k.root.position.set(_,v,0),k.root.scale.setScalar(g),k.bgU.uRes.value.set(d,f),k.bgU.uCenter.value.set(_/h*.5*(d/f),v/m*.5),k.bgU.uSpread.value=g*1.05,k.dropMat.uniforms.uPx.value=f*a.getPixelRatio()/(2*Math.tan(p.fov*Math.PI/360)),k.wand.rotation.set(0,0,0),k.wand.quaternion.setFromUnitVectors(j.t1.set(0,0,1),G),k.wand.rotateY(Math.sin(j.t*.6)*.06),k.wand.rotateX(Math.sin(j.t*.45+1)*.04);let y=u.reduce((e,t)=>e+ +!!t.on,0);n.current!==j.lastBlowReq&&(j.lastBlowReq=n.current,Q()),j.blowT+=s;let b=B?4:6;!D&&j.blowT>(l>.5?1.3:2.6)&&(y<b||l>.5&&y<8)&&Q()&&(j.blowT=0);let x=u.some(e=>e.on&&e.phase===0);j.discFade=x?0:Math.min(1,j.discFade+s*1.4),k.discU.uFade.value=j.discFade,k.discU.uDrain.value=.3+.1*Math.sin(j.t*.3);let S=U;for(let e=0;e<V;e++){let t=u[e];if(t.on){if(t.age+=s,t.phase===0){t.t+=s/1.05;let e=Math.min(t.t,1);t.r=t.rT*(.22+.78*Z(e)),t.p.copy(W).addScaledVector(G,t.r*.9),t.sqT=-.16*(1-e),t.ax.copy(G),e>=1&&(t.phase=1,t.sqT=0,t.sqV+=1.4,t.v.copy(G).multiplyScalar(.75).add(j.tmp.set(X(-.15,.15)+l*.4,.1,X(-.05,.05))))}else if(t.phase===1){let n=t.seed,r=.2*(Math.sin(j.t*.37+n*5.1)+.5*Math.sin(j.t*.71+n*2.3))-(t.p.x-.1)*.04,i=.05+.16*Math.sin(j.t*.29+n*3.7)-(t.p.y-.45)*.05,a=.1*Math.sin(j.t*.23+n*1.9)-t.p.z*.1,o=.65+.35*Math.sin(j.t*1.3+n)*Math.sin(j.t*.37);t.v.x+=(r+l*1.1*o)*s,t.v.y+=(i+l*.12*Math.sin(j.t*2.1+n))*s,t.v.z+=a*s,t.p.x-t.r<S.x0&&(t.v.x+=(S.x0-t.p.x+t.r)*3*s),t.p.x+t.r>S.x1&&(t.v.x-=(t.p.x+t.r-S.x1)*3*(1-l)*s),t.p.y-t.r<S.y0&&(t.v.y+=(S.y0-t.p.y+t.r)*3*s),t.p.y+t.r>S.y1&&(t.v.y-=(t.p.y+t.r-S.y1)*3*s),t.p.z-t.r<S.z0&&(t.v.z+=(S.z0-t.p.z+t.r)*3*s),t.p.z+t.r>S.z1&&(t.v.z-=(t.p.z+t.r-S.z1)*3*s);let c=j.tmp.copy(t.p).sub(W),u=c.length();if(u<t.r+K*.9&&t.v.addScaledVector(c.normalize(),(t.r+K*.9-u)*4*s),t.v.multiplyScalar(Math.exp(-s*.9)),l>.3&&t.p.x-t.r>S.x1+.6){N(e),t.on=!1;continue}t.age>t.life&&P(e,j.tmp.set(X(-.3,.3),1,X(-.2,.3)))}else if(t.phase===2){t.t+=s;let e=t.t/q;t.u.uPop.value=Math.min(e,1);let n=t.u.uPopDir.value;j.t1.set(0,1,0).cross(n),j.t1.lengthSq()<.001&&j.t1.set(1,0,0),j.t1.normalize(),j.t2.copy(n).cross(j.t1);let r=Math.min(e*1.2,1)*Math.PI,i=Math.round(9*t.r+3);for(let e=0;e<i;e++){let e=Math.random()*Math.PI*2,i=Math.cos(e),a=Math.sin(e),o=n.x*Math.cos(r)+(j.t1.x*i+j.t2.x*a)*Math.sin(r),s=n.y*Math.cos(r)+(j.t1.y*i+j.t2.y*a)*Math.sin(r),c=n.z*Math.cos(r)+(j.t1.z*i+j.t2.z*a)*Math.sin(r),l=-n.x*Math.sin(r)+(j.t1.x*i+j.t2.x*a)*Math.cos(r),u=-n.y*Math.sin(r)+(j.t1.y*i+j.t2.y*a)*Math.cos(r),d=-n.z*Math.sin(r)+(j.t1.z*i+j.t2.z*a)*Math.cos(r),f=X(1.2,3.4)*(.6+t.r);M(t.p.x+o*t.r,t.p.y+s*t.r,t.p.z+c*t.r,l*f+o*.5+t.v.x,u*f+s*.5+t.v.y,d*f+c*.5,X(.35,.75),X(.02,.055))}if(e>=1){t.on=!1;continue}}else if(t.phase===3){t.t+=s;let e=Math.min(t.t/J,1),n=u[t.into];if(t.r=t.rT*(1-Z(e)),n?.on&&t.p.lerp(n.p,1-Math.exp(-s*9)),t.u.uFade.value=1-e*e,e>=1){t.on=!1;continue}}t.phase===1&&(t.r=C.damp(t.r,t.rT,5,s)),t.sqV+=(-(t.sq-t.sqT)*95-t.sqV*6.5)*s,t.sq+=t.sqV*s,t.sq=C.clamp(t.sq,-.3,.3)}}for(let e=0;e<V;e++){let t=u[e];if(t.on&&t.phase!==2&&t.phase!==3)for(let n=e+1;n<V;n++){let r=u[n];if(!r.on||r.phase===2||r.phase===3)continue;let i=j.tmp.copy(r.p).sub(t.p),a=i.length(),o=t.r+r.r;if(a>=o||a<1e-4)continue;let c=i.divideScalar(a),l=k.links.find(t=>t.a===e&&t.b===n||t.a===n&&t.b===e);if(!l&&t.phase===1&&r.phase===1&&t.links<2&&r.links<2){l={a:e,b:n,t:0,mergeAt:Math.random()<.4?X(3.5,8):1/0},k.links.push(l),t.links++,r.links++;let i=j.tmp2.copy(t.v).sub(r.v).dot(c),a=.9+Math.max(i,0)*2.5;t.ax.copy(c),r.ax.copy(c),t.sqV+=a,r.sqV+=a}if(!l){let e=(o-a)*Math.min(1,s*12),n=t.phase===1?r.phase===1?.5:1:0,i=r.phase===1?1-n:0;t.p.addScaledVector(c,-e*n),r.p.addScaledVector(c,e*i);let l=j.tmp2.copy(r.v).sub(t.v).dot(c);l<0&&(t.v.addScaledVector(c,l*n),r.v.addScaledVector(c,-l*i))}}}for(let e=k.links.length-1;e>=0;e--){let t=k.links[e],n=u[t.a],r=u[t.b],i=j.tmp.copy(r.p).sub(n.p),a=Math.max(i.length(),1e-4),o=n.r+r.r;if(!(n.on&&r.on&&n.phase<2&&r.phase<2)||a>o*1.04){n.links--,r.links--,k.links.splice(e,1);continue}t.t+=s;let c=i.divideScalar(a),l=o*.84,d=j.tmp2.copy(r.v).sub(n.v).dot(c),f=((a-l)*2.2+d*1.4)*s,p=n.r*n.r*n.r,m=r.r*r.r*r.r;if(n.v.addScaledVector(c,f*m/(p+m)*2),r.v.addScaledVector(c,-f*p/(p+m)*2),t.t>t.mergeAt&&!D){let[i,a,o,s]=n.r<r.r?[n,r,t.a,t.b]:[r,n,t.b,t.a];n.links--,r.links--,k.links.splice(e,1),N(o),i.phase=3,i.t=0,i.rT=i.r,i.into=s,a.rT=Math.min(Math.cbrt(a.r**3+i.r**3),1.3),a.ax.copy(c),a.sqV-=2;let l=(n.p.x+r.p.x)/2,u=(n.p.y+r.p.y)/2,d=(n.p.z+r.p.z)/2;for(let e=0;e<26;e++)M(l,u,d,X(-1.2,1.2),X(-.6,1.4),X(-1.2,1.2),X(.35,.7),X(.02,.05))}}for(let e of u)e.planes=0;for(let e of k.links){let t=u[e.a],n=u[e.b];if(!t.on||!n.on)continue;let r=j.tmp.copy(n.p).sub(t.p),i=Math.max(r.length(),1e-4);if(i>=t.r+n.r)continue;r.divideScalar(i);let a=(i*i+t.r*t.r-n.r*n.r)/(2*i),o=i-a,s=(e,t,n,r,i)=>{let a=e.planes===0?e.u.uPlaneA.value:e.u.uPlaneB.value;e.planes<2&&a.set(t,n,r,C.clamp(i,.15,1)),e.planes++};s(t,r.x,r.y,r.z,a/t.r),s(n,-r.x,-r.y,-r.z,o/n.r)}j.order.length=0;for(let e=0;e<V;e++){let t=u[e],n=t.on;t.front.visible=t.back.visible=n,n&&(t.phase===1&&t.p.addScaledVector(t.v,s),t.planes<1&&(t.u.uPlaneA.value.w=10),t.planes<2&&(t.u.uPlaneB.value.w=10),t.front.position.copy(t.p),t.back.position.copy(t.p),t.front.scale.setScalar(t.r),t.back.scale.setScalar(t.r),t.u.uSquash.value.set(t.ax.x,t.ax.y,t.ax.z,t.sq),t.u.uDrain.value=C.clamp(t.age/t.life,0,1),t.u.uWob.value=.022+l*.022+Math.abs(t.sqV)*.004,j.order.push(e))}j.order.sort((e,t)=>u[e].p.z-u[t].p.z),j.order.forEach((e,t)=>{u[e].back.renderOrder=10+t*2,u[e].front.renderOrder=11+t*2});let w=0;for(;w<j.order.length&&u[j.order[w]].p.z<W.z;)w++;k.disc.renderOrder=9+w*2;let T=k.D;for(let e=0;e<H;e++){if(T.life[e]<=0){T.a[e]=0;continue}T.life[e]-=s;let t=e*3;T.vel[t+1]-=4.2*s;let n=Math.exp(-s*2.2);T.vel[t]*=n,T.vel[t+1]*=n,T.vel[t+2]*=n,T.pos[t]+=T.vel[t]*s,T.pos[t+1]+=T.vel[t+1]*s,T.pos[t+2]+=T.vel[t+2]*s;let r=Math.max(T.life[e]/T.max[e],0);T.a[e]=Math.min(r*1.6,1),T.s[e]=T.size[e]*(.6+.4*r)}k.dropGeo.attributes.position.needsUpdate=!0,k.dropGeo.attributes.aA.needsUpdate=!0,k.dropGeo.attributes.aS.needsUpdate=!0,a.setRenderTarget(null),a.render(o,E)},1),(0,z.jsx)(`primitive`,{object:k.root,onPointerDown:$})}function $(){let[e,t]=(0,A.useState)(1),[n,s]=(0,A.useState)(!1),[c,l]=(0,A.useState)(0),[u,d]=(0,A.useState)(!1),f=i(Y[1].v),p=i(0),m=(0,A.useRef)(0);(0,A.useEffect)(()=>{let t=r(f,Y[e].v,{duration:1.4,ease:[.4,0,.2,1]});return()=>t.stop()},[e,f]),(0,A.useEffect)(()=>{let e=r(p,+!!n,{duration:n?1.2:1.8,ease:`easeInOut`});return()=>e.stop()},[n,p]);let h=(0,A.useCallback)(()=>l(e=>e+1),[]),g=(0,A.useCallback)(()=>d(!0),[]),_=Y[e];return(0,z.jsxs)(`div`,{className:`stage sb`,style:{background:`#05070c`},children:[(0,z.jsx)(`style`,{children:ae}),(0,z.jsx)(E,{dpr:[1,2],camera:{position:[0,0,12],fov:32},gl:{antialias:!0,alpha:!1,powerPreference:`high-performance`},children:(0,z.jsx)(Q,{thick:f,wind:p,blowReq:m,onPop:h,onReady:g})}),(0,z.jsx)(a.div,{className:`sb-veil`,initial:{opacity:1},animate:{opacity:+!u},transition:{duration:.9,ease:`easeOut`}}),(0,z.jsxs)(`div`,{className:`overlay`,children:[(0,z.jsxs)(a.div,{className:`hero-copy sb-copy`,initial:{opacity:0,y:12,filter:`blur(6px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},transition:{duration:.9,delay:.3,ease:[.23,1,.32,1]},children:[(0,z.jsx)(`div`,{className:`scrim`}),(0,z.jsxs)(`p`,{className:`kicker`,children:[(0,z.jsx)(`i`,{}),` Thin-film interference`]}),(0,z.jsx)(`h1`,{children:`肥皂泡`}),(0,z.jsx)(`p`,{className:`sb-lede`,children:`泡膜只有几百纳米厚，前后两个面反射的光彼此加强或抵消——颜色于是随膜厚流动。水往下流，顶部越来越薄，变黑时它就快破了。`}),(0,z.jsx)(`div`,{className:`sb-meta`,children:(0,z.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,z.jsx)(a.span,{initial:{opacity:0,y:8,filter:`blur(4px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},exit:{opacity:0,y:-6,filter:`blur(4px)`},transition:{duration:.45,ease:[.23,1,.32,1]},children:_.note},_.label)})}),(0,z.jsxs)(`p`,{className:`sb-count`,children:[`已戳破 `,(0,z.jsx)(`b`,{children:c}),` 个`]})]}),(0,z.jsxs)(`div`,{className:`dock sb-dock`,children:[(0,z.jsx)(`button`,{className:`seg sb-blow`,onClick:()=>void(m.current+=1),children:(0,z.jsx)(`span`,{children:`吹泡泡`})}),(0,z.jsx)(`span`,{className:`dock-sep`}),(0,z.jsx)(`button`,{className:`seg sb-tog`,"aria-pressed":n,onClick:()=>s(e=>!e),children:(0,z.jsx)(`span`,{children:`风`})}),(0,z.jsx)(`span`,{className:`dock-sep`}),(0,z.jsx)(`span`,{className:`sb-label`,children:`膜厚`}),(0,z.jsx)(O,{items:Y.map((e,t)=>({value:t,label:e.label})),value:e,onChange:t})]}),(0,z.jsxs)(`p`,{className:`hint`,children:[`点泡泡 → 啪地破掉`,(0,z.jsx)(`br`,{}),`碰到一起会粘成一面平墙`]})]})]})}var ae=`
.sb-veil { position: absolute; inset: 0; background: #05070c; pointer-events: none; }
.sb .sb-copy { --soft-bg: rgba(5, 7, 12, .8); }
.sb .kicker i { background: #9fe6ff; box-shadow: 0 0 10px #9fe6ff; }
.sb .sb-copy h1 { font-size: clamp(42px, 5vw, 68px); background: linear-gradient(100deg, #f4f2ee 30%, #ffd6f0 55%, #b9f1ff 75%, #f4f2ee 95%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.sb .sb-lede { max-width: 370px; font-size: 15px; }
.sb-meta { margin-top: 22px; min-height: 40px; max-width: 360px; font: 500 12px/1.6 var(--mono); letter-spacing: .02em; color: var(--fg-2); }
.sb-meta span { display: inline-block; }
.sb-count { margin-top: 10px !important; font: 500 12px/1 var(--mono) !important; color: var(--fg-2); }
.sb-count b { color: #9fe6ff; font-weight: 600; }
.sb-label { padding: 0 6px 0 8px; font: 500 12px/1 var(--sans); color: var(--fg-2); }
.sb-blow { color: var(--fg) !important; background: linear-gradient(100deg, rgba(255,127,158,.28), rgba(159,230,255,.24)) !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
.sb-blow:active { transform: scale(.96); }
.sb-tog { transition: background .25s, color .2s; }
.sb-tog[aria-pressed='true'] { background: color-mix(in srgb, #9fe6ff 22%, transparent); }
.sb canvas { cursor: pointer; }
@media (max-width: 760px) {
  .sb .sb-copy { bottom: 92px; }
  .sb .sb-lede { font-size: 13.5px; margin-top: 12px; }
  .sb-meta { display: none; }
  .sb-count { display: none; }
  .sb-dock .seg { padding: 0 11px; }
  .sb-label { display: none; }
}
`;export{$ as default};