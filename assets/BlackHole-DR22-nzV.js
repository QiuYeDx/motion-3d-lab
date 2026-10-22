import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-spring-RAFdCaft.js";import{t as a}from"./use-motion-value-CVpXW8PZ.js";import{n as o,r as s}from"./index-gQ65n0JU.js";import{Lt as c,Mt as l,Pt as u,Xt as d,Yt as f,h as p,u as m,vn as h,wt as g,xt as _,yn as v}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as y}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as b}from"./iso-CLB38p39.js";import{t as x}from"./Seg-CH5KfWEm.js";import{t as S}from"./PerformanceMonitor-DOuNfnyh.js";import{t as C}from"./glsl-oFfHlTlN.js";var w=e(t(),1),T=n(),E=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,D=typeof window<`u`?Math.min(window.devicePixelRatio||1,2):1,O=E?Math.min(D,1.5)*.62:D>1.3?D*.6:.9,k=E?150:220,A=1.65,j=3,M=10.5,N=`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`,P=`
precision highp float;
uniform vec2 uRes;
uniform vec2 uShift;
uniform float uZoom;
uniform float uTime;
uniform float uBright;
uniform float uFade;
uniform float uPix;
uniform vec3 uRo, uRt, uUp, uFw;

#define STEPS ${k}
#define FOCAL ${A.toFixed(3)}
#define RIN ${j.toFixed(2)}
#define ROUT ${M.toFixed(2)}
#define RESC 46.0

${C}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// temperature ramp (t ≈ T / T_inner): deep red → orange → gold → white-hot → blue-white (linear rgb)
vec3 heat(float t) {
  vec3 c = mix(vec3(0.42, 0.03, 0.01), vec3(1.0, 0.22, 0.03), smoothstep(0.15, 0.45, t));
  c = mix(c, vec3(1.0, 0.56, 0.16), smoothstep(0.45, 0.72, t));
  c = mix(c, vec3(1.0, 0.86, 0.62), smoothstep(0.72, 0.98, t));
  c = mix(c, vec3(0.78, 0.86, 1.0), smoothstep(1.05, 1.5, t));
  return c;
}

/* ---- disk ---- */
float diskNoise(float ang, float lr, float seed) {
  vec3 q = vec3(cos(ang) * 1.25, sin(ang) * 1.25, lr * 6.5 + seed);
  float n = snoise(q) * 0.5;
  n += snoise(q * vec3(2.6, 2.6, 3.1) + 7.1) * 0.3;
  n += snoise(q * vec3(6.0, 6.0, 8.0) - 3.7) * 0.2;
  return n;
}

// emission (rgb) and opacity (a) where the ray crosses the plane; dir = traced direction (photon goes -dir)
vec4 diskAt(vec3 pc, vec3 dir) {
  float r = length(pc.xz);
  if (r < RIN - 0.35 || r > ROUT) return vec4(0.0);
  float th = atan(pc.z, pc.x);
  float om = 0.7071 * pow(r, -1.5);
  // Keplerian shear winds the noise up forever: run two phase-shifted copies and cross-fade (flow-map trick)
  const float P = 34.0;
  float a = fract(uTime / P);
  float wA = 1.0 - abs(2.0 * a - 1.0);
  float wB = 1.0 - wA;
  float lr = log(r);
  float nA = diskNoise(th - om * a * P, lr, 0.0);
  float nB = diskNoise(th - om * fract(a + 0.5) * P, lr, 19.7);
  float n = (nA * wA + nB * wB) * inversesqrt(wA * wA + wB * wB);

  float edgeIn = smoothstep(RIN - 0.35, RIN + 0.5, r);
  float edgeOut = 1.0 - smoothstep(ROUT * 0.5, ROUT, r);
  float rings = 0.82 + 0.18 * sin(lr * 30.0 + n * 5.0);
  float clump = smoothstep(-0.55, 0.6, n);
  float dens = edgeIn * edgeOut * (0.12 + 1.1 * clump * clump) * rings;

  // relativistic beaming: orbital speed (pseudo-Newtonian) against the photon's direction, + gravitational redshift
  float beta = sqrt(0.5 / max(r - 1.0, 0.6));
  vec3 vdir = vec3(-pc.z, 0.0, pc.x) / r;
  float mu = dot(vdir, -dir);
  float g = sqrt(1.0 - beta * beta) / (1.0 - beta * mu) * sqrt(1.0 - 1.0 / r);
  g = pow(g, 0.85);

  float prof = pow(r / RIN, -0.62);
  vec3 c = heat(prof * g);
  float I = prof * prof * pow(g, 3.0) * 1.5;
  // the hot inner rim gets a touch of extra fire
  I *= 1.0 + 1.4 * exp(-(r - RIN - 0.25) * (r - RIN - 0.25) * 6.0);
  float alpha = clamp(dens * 1.05, 0.0, 0.94);
  return vec4(c * I * dens * uBright, alpha);
}

/* ---- sky (sampled by the final, lensed direction) ---- */
vec3 starLayer(vec3 d, float scale, float keep, float gain) {
  vec3 q = d * scale;
  vec3 id = floor(q);
  vec3 h = hash33(id);
  if (h.z > keep) return vec3(0.0);
  vec3 sp = 0.22 + 0.56 * hash33(id + 17.31);
  vec3 dv = q - id - sp;
  float w0 = 0.04;
  float w = max(w0, uPix * scale * 0.75);
  float e = exp(-dot(dv, dv) / (w * w)) * (w0 * w0) / (w * w);
  float mag = pow(h.x, 7.0) * 7.0 + 0.18;
  vec3 tint = mix(vec3(1.0, 0.72, 0.5), vec3(0.62, 0.78, 1.0), smoothstep(0.2, 0.9, h.y));
  return tint * mag * e * gain;
}

vec3 sky(vec3 d) {
  vec3 bn = normalize(vec3(0.35, 1.0, -0.25));
  float bd = dot(d, bn);
  float band = exp(-bd * bd * 7.0);
  float n1 = snoise(d * 1.7 + vec3(3.0, 1.0, 0.0)) * 0.5 + 0.5;
  float n2 = snoise(d * 4.3 - vec3(1.0, 5.0, 2.0)) * 0.5 + 0.5;
  vec3 neb = vec3(0.32, 0.12, 0.5) * n1 * n1 * (0.18 + band * 0.7) + vec3(0.04, 0.2, 0.32) * pow(n2, 3.0) * (0.1 + band);
  neb *= 0.11;
  // dust lane: darker streaks inside the band
  neb *= 1.0 - band * 0.6 * smoothstep(0.45, 0.8, n2);
  vec3 s = starLayer(d, 80.0, 0.42, 1.0) + starLayer(d, 190.0, 0.55 * (0.45 + band), 0.6);
  return neb + s;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv = (uv - uShift) / uZoom;
  vec3 rd = normalize(uFw * FOCAL + uv.x * uRt + uv.y * uUp);

  vec3 p = uRo;
  vec3 v = rd;
  vec3 hv = cross(p, v);
  float h2 = dot(hv, hv);
  vec3 col = vec3(0.0);
  float Tr = 1.0;
  float glow = 0.0;
  float ring = 0.0;
  bool captured = false;
  for (int i = 0; i < STEPS; i++) {
    float r2 = dot(p, p);
    float r = sqrt(r2);
    if (r < 1.0) { captured = true; break; }
    if (r > RESC && dot(p, v) > 0.0) break;
    float dt = clamp(0.075 * r - 0.03, 0.035, 2.6);
    vec3 pp = p;
    v += (-1.5 * h2 / (r2 * r2 * r)) * p * dt;
    p += v * dt;
    float dl = dt * length(v);
    // bloom-ish halo around the disk and a thin photon-sphere ring, integrated along the bent ray
    float rr = length(p.xz);
    glow += Tr * dl * exp(-p.y * p.y * 3.0) * smoothstep(ROUT + 5.0, RIN, rr) * smoothstep(2.2, RIN + 0.8, rr) * step(2.4, r);
    float dr = (r - 1.5) * 9.0;
    ring += Tr * dl * exp(-dr * dr);
    if (pp.y * p.y < 0.0) {
      vec3 pc = mix(pp, p, pp.y / (pp.y - p.y));
      vec4 dk = diskAt(pc, normalize(v));
      col += Tr * dk.rgb;
      Tr *= 1.0 - dk.a;
      if (Tr < 0.01) break;
    }
  }
  if (!captured && Tr > 0.01) col += Tr * sky(normalize(v));
  // light from the halo that ends up in the hole would have to cross the shadow: keep the shadow inky
  col += vec3(1.0, 0.42, 0.12) * glow * (captured ? 0.006 : 0.024) * uBright;
  // photon ring: rays that skim the photon sphere. Captured rays that fall straight in only graze it briefly
  // (ring < ~1.5) and must stay black; near-critical ones that linger keep it, so the rim stays continuous.
  float rg = captured ? max(ring - 1.6, 0.0) : ring;
  col += vec3(1.0, 0.72, 0.45) * rg * 0.5 * uBright;

  // filmic-ish shoulder, then display gamma
  col = 1.0 - exp(-col * 1.15);
  col = pow(col, vec3(1.0 / 2.2));
  vec2 sv = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - dot(sv, sv) * 0.6;
  col *= uFade;
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`,F=[{key:`side`,zh:`侧视`,el:.075,dist:29,note:`倾角 4° · 盘的背面被抬成上下两道光弧`},{key:`high`,zh:`俯视`,el:.46,dist:29,note:`倾角 26° · 光弧压扁成一圈，阴影偏向一侧`},{key:`face`,zh:`正视`,el:1.28,dist:31,note:`倾角 73° · 正对盘面，多普勒差异几乎消失`}],I=[{v:.25,label:`0.25×`},{v:1,label:`1×`},{v:4,label:`4×`}];function L({el:e,dist:t,bright:n,rate:r,drag:i}){let a=p(e=>e.gl),o=p(e=>e.size),s=(0,w.useMemo)(()=>{let e={uRes:{value:new h},uShift:{value:new h},uZoom:{value:1},uTime:{value:0},uBright:{value:1},uFade:{value:0},uPix:{value:.001},uRo:{value:new v},uRt:{value:new v},uUp:{value:new v},uFw:{value:new v}},t=new d({vertexShader:N,fragmentShader:P,uniforms:e,depthTest:!1,depthWrite:!1,toneMapped:!1}),n=new c(2,2),r=new g(n,t);r.frustumCulled=!1;let i=new f;return i.add(r),{uniforms:e,mat:t,geo:n,scene:i,cam:new u(-1,1,1,-1,0,1)}},[]);(0,w.useEffect)(()=>()=>{s.mat.dispose(),s.geo.dispose()},[s]);let y=(0,w.useRef)(!1);(0,w.useEffect)(()=>{let e=!0,t=a.getRenderTarget();return a.setRenderTarget(null),a.compileAsync(s.scene,s.cam).catch(()=>{}).then(()=>{e&&(y.current=!0)}),a.setRenderTarget(t),()=>{e=!1}},[s,a]);let x=(0,w.useMemo)(()=>({t:b?41:6,fade:0,ro:new v,fw:new v,rt:new v,up:new v,tmp:new v}),[]);return m((c,u)=>{let d=Math.min(u,1/30);if(!y.current){a.setRenderTarget(null),a.setClearColor(131587,1),a.clear();return}let f=s.uniforms,p=i.current;if(!p.on){p.az+=p.vAz*d,e.set(_.clamp(e.get()+p.vEl*d,-1.35,1.35));let t=Math.exp(-d*2.6);p.vAz*=t,p.vEl*=t}p.az+=d*(b?0:.035),x.t+=d*r.get()*3.2,x.fade=Math.min(1,x.fade+d*.9);let m=e.get(),h=t.get();x.ro.set(Math.cos(m)*Math.sin(p.az),Math.sin(m),Math.cos(m)*Math.cos(p.az)).multiplyScalar(h),x.fw.copy(x.ro).multiplyScalar(-1).normalize(),x.rt.crossVectors(x.fw,l.DEFAULT_UP).normalize(),x.up.crossVectors(x.rt,x.fw);let g=.1;x.tmp.copy(x.rt).multiplyScalar(Math.cos(g)).addScaledVector(x.up,Math.sin(g)),x.up.multiplyScalar(Math.cos(g)).addScaledVector(x.rt,-Math.sin(g)),x.rt.copy(x.tmp),a.getDrawingBufferSize(f.uRes.value);let v=o.width/o.height,S=o.width<760;b?(f.uShift.value.set(0,0),f.uZoom.value=1.08):S?(f.uShift.value.set(0,.15),f.uZoom.value=Math.min(.78,v*1.55)):(f.uShift.value.set(Math.min(.17*v,.33),0),f.uZoom.value=1),f.uPix.value=1/(f.uRes.value.y*A*f.uZoom.value),f.uRo.value.copy(x.ro),f.uFw.value.copy(x.fw),f.uRt.value.copy(x.rt),f.uUp.value.copy(x.up),f.uTime.value=x.t,f.uBright.value=n.get(),f.uFade.value=x.fade*x.fade*(3-2*x.fade),a.setRenderTarget(null),a.render(s.scene,s.cam)},1),null}function R(){let[e,t]=(0,w.useState)(0),[n,c]=(0,w.useState)(1),[l,u]=(0,w.useState)(1),[d,f]=(0,w.useState)(O),p=a(F[0].el),m=a(F[0].dist),h=i(1,{stiffness:60,damping:18}),g=i(1,{stiffness:22,damping:10}),v=(0,w.useRef)({on:!1,x:0,y:0,t:0,vAz:0,vEl:0,az:b?.6:.35}),C=(0,w.useRef)([]),E=e=>{t(e),C.current.forEach(e=>e.stop()),v.current.vEl=0,C.current=[r(p,F[e].el,{type:`spring`,stiffness:26,damping:11,mass:1.2}),r(m,F[e].dist,{type:`spring`,stiffness:26,damping:12,mass:1.2})]};(0,w.useEffect)(()=>()=>C.current.forEach(e=>e.stop()),[]),(0,w.useEffect)(()=>h.set(l),[l,h]),(0,w.useEffect)(()=>g.set(I[n].v),[n,g]);let D=e=>{if(e.target.closest(`.dock, button, input, a`))return;let t=v.current;t.on=!0,t.x=e.clientX,t.y=e.clientY,t.t=performance.now(),t.vAz=0,t.vEl=0,C.current.forEach(e=>e.stop()),e.currentTarget.setPointerCapture(e.pointerId)},A=e=>{let t=v.current;if(!t.on)return;let n=performance.now(),r=Math.max((n-t.t)/1e3,1/240),i=e.clientX-t.x,a=e.clientY-t.y,o=.0055;p.set(_.clamp(p.get()+a*o,-1.35,1.35)),t.vAz=_.lerp(t.vAz,-i*o/r,.5),t.vEl=_.lerp(t.vEl,a*o/r,.5),t.az+=-i*o,t.x=e.clientX,t.y=e.clientY,t.t=n},j=()=>{let e=v.current;e.on&&(e.on=!1,performance.now()-e.t>90&&(e.vAz=0,e.vEl=0),e.vAz=_.clamp(e.vAz,-3,3),e.vEl=_.clamp(e.vEl,-2,2))},M=F[e];return(0,T.jsxs)(`div`,{className:`stage bh`,style:{background:`#020203`,touchAction:`none`},onPointerDown:D,onPointerMove:A,onPointerUp:j,onPointerCancel:j,children:[(0,T.jsx)(`style`,{children:z}),(0,T.jsxs)(y,{dpr:d,gl:{antialias:!1,alpha:!1,powerPreference:`high-performance`},orthographic:!0,camera:{position:[0,0,1]},children:[(0,T.jsx)(S,{onDecline:()=>f(e=>Math.max(.45,e*.8)),onIncline:()=>f(e=>Math.min(O,e*1.15)),flipflops:3}),(0,T.jsx)(L,{el:p,dist:m,bright:h,rate:g,drag:v})]}),(0,T.jsxs)(`div`,{className:`overlay`,children:[(0,T.jsxs)(o.div,{className:`hero-copy bh-copy`,initial:{opacity:0,y:12,filter:`blur(6px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},transition:{duration:.9,delay:.35,ease:[.23,1,.32,1]},children:[(0,T.jsx)(`div`,{className:`scrim`}),(0,T.jsxs)(`p`,{className:`kicker`,children:[(0,T.jsx)(`i`,{}),` Schwarzschild · Ray bending`]}),(0,T.jsx)(`h1`,{children:`事件视界`}),(0,T.jsx)(`p`,{className:`bh-lede`,children:`每条光线都被引力弯折：吸积盘的背面被抬到黑洞头顶，迎面旋来的一侧更亮、更蓝。`}),(0,T.jsx)(`div`,{className:`bh-meta`,children:(0,T.jsx)(s,{mode:`popLayout`,initial:!1,children:(0,T.jsx)(o.span,{initial:{opacity:0,y:8,filter:`blur(4px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},exit:{opacity:0,y:-6,filter:`blur(4px)`},transition:{duration:.45,ease:[.23,1,.32,1]},children:M.note},M.key)})})]}),(0,T.jsxs)(`div`,{className:`dock bh-dock`,children:[(0,T.jsx)(x,{items:F.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:E}),(0,T.jsx)(`span`,{className:`dock-sep`}),(0,T.jsxs)(`label`,{className:`bh-range`,title:`吸积盘亮度`,children:[(0,T.jsx)(`span`,{children:`亮度`}),(0,T.jsx)(`input`,{type:`range`,min:.3,max:2,step:.01,value:l,onChange:e=>u(Number(e.target.value)),style:{"--v":`${(l-.3)/1.7*100}%`}})]}),(0,T.jsx)(`span`,{className:`dock-sep bh-sep2`}),(0,T.jsx)(x,{items:I.map((e,t)=>({value:t,label:e.label})),value:n,onChange:c})]}),(0,T.jsxs)(`p`,{className:`hint`,children:[`拖动环绕 · 松手带惯性`,(0,T.jsx)(`br`,{}),`r`,(0,T.jsx)(`sub`,{children:`s`}),` = 1 · ≤ `,k,` steps / ray`]})]})]})}var z=`
.bh .bh-copy { --soft-bg: rgba(2, 2, 3, .78); }
.bh .kicker i { background: #ffb36b; box-shadow: 0 0 10px #ff9a4a; }
.bh .bh-copy h1 { font-size: clamp(40px, 5vw, 68px); }
.bh .bh-lede { max-width: 360px; font-size: 15px; }
.bh-meta { margin-top: 22px; min-height: 20px; font: 500 12px/1.5 var(--mono); letter-spacing: .03em; color: var(--fg-2); }
.bh-meta span { display: inline-block; }
.bh-range { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px 0 8px; font: 500 13px/1 var(--sans); color: var(--fg-2); cursor: pointer; }
.bh-range input { -webkit-appearance: none; appearance: none; width: 92px; height: 18px; margin: 0; background: transparent; cursor: pointer; }
.bh-range input::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: linear-gradient(90deg, #ffb36b var(--v), rgba(255,255,255,.16) var(--v)); }
.bh-range input::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: #fff4e6; box-shadow: 0 0 0 3px rgba(255,179,107,.25), 0 0 12px rgba(255,160,80,.6); }
.bh-range input::-moz-range-track { height: 4px; border-radius: 4px; background: rgba(255,255,255,.16); }
.bh-range input::-moz-range-progress { height: 4px; border-radius: 4px; background: #ffb36b; }
.bh-range input::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: #fff4e6; }
.bh canvas { cursor: grab; }
.bh canvas:active { cursor: grabbing; }
@media (max-width: 760px) {
  .bh .bh-copy { bottom: 136px; }
  .bh .bh-lede { font-size: 13.5px; }
  .bh-meta { display: none; }
  .bh-dock { flex-wrap: wrap; justify-content: center; row-gap: 2px; border-radius: 22px; width: max-content; }
  .bh-dock .seg { padding: 0 11px; }
  .bh-sep2 { display: none; }
}
`;export{R as default};