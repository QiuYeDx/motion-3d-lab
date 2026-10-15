import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CX_WDEyT.js";import{t as i}from"./use-spring-BV8nDvvz.js";import{n as a,r as o}from"./index-uImfd-0P.js";import{At as s,Ft as c,Jt as l,Mt as u,St as d,Wt as f,_n as p,bn as m,dt as h,gn as g,h as _,qt as v,rt as y,u as b,yn as x,yt as S}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as C}from"./react-three-fiber.esm-BQtD7wyt.js";import{n as w}from"./iso-C377rVhz.js";import{t as T}from"./Seg-BfWvO_Xs.js";import{t as E}from"./PerformanceMonitor-DPWwL5ZK.js";import{n as D}from"./glsl-CTWV-b_3.js";var O=e(t(),1),k=n(),A=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,j=typeof window<`u`?Math.min(window.devicePixelRatio||1,2):1,M=Math.min(j,A?1.25:1.5),N=.5,P=A?46:64,F=A?4:5,I=A?20:28,L=1.2,R=64,z=`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`,B=`
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`,V=`
precision highp float;
uniform float uLayer;
#define N ${R.toFixed(1)}
${B}
float worley(vec3 p, float per) {
  vec3 id = floor(p);
  vec3 f = p - id;
  float d = 1.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 diff = o + hash33(mod(id + o, per)) - f;
    d = min(d, dot(diff, diff));
  }
  return sqrt(d);
}
float grad(vec3 i, vec3 f, vec3 o, float per) {
  vec3 g = normalize(hash33(mod(i + o, per) + 11.7) * 2.0 - 1.0);
  return dot(g, f - o);
}
float gnoise(vec3 p, float per) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = grad(i, f, vec3(0.0, 0.0, 0.0), per), b = grad(i, f, vec3(1.0, 0.0, 0.0), per);
  float c = grad(i, f, vec3(0.0, 1.0, 0.0), per), d = grad(i, f, vec3(1.0, 1.0, 0.0), per);
  float e = grad(i, f, vec3(0.0, 0.0, 1.0), per), g = grad(i, f, vec3(1.0, 0.0, 1.0), per);
  float h = grad(i, f, vec3(0.0, 1.0, 1.0), per), k = grad(i, f, vec3(1.0, 1.0, 1.0), per);
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
void main() {
  vec3 p = vec3(gl_FragCoord.xy, uLayer + 0.5) / N;
  float pf = 0.0, amp = 0.5, fr = 4.0;
  for (int o = 0; o < 4; o++) { pf += amp * gnoise(p * fr, fr); amp *= 0.5; fr *= 2.0; }
  pf = clamp(pf * 0.9 + 0.5, 0.0, 1.0);
  float w1 = 1.0 - worley(p * 4.0, 4.0);
  float w2 = 1.0 - worley(p * 8.0, 8.0);
  float w3 = 1.0 - worley(p * 16.0, 16.0);
  float w4 = 1.0 - worley(p * 32.0, 32.0);
  float wf = w1 * 0.625 + w2 * 0.25 + w3 * 0.125;
  // perlin-worley: billowy cells with perlin connectivity
  float pw = clamp((pf - (wf - 1.0)) / (2.0 - wf), 0.0, 1.0);
  float det = w2 * 0.625 + w3 * 0.25 + w4 * 0.125;
  float hi = w3 * 0.6 + w4 * 0.4;
  float lo = clamp(0.5 + 0.8 * (gnoise(p * 2.0, 2.0) * 0.65 + gnoise(p * 4.0, 4.0) * 0.35), 0.0, 1.0);
  gl_FragColor = vec4(pw, det, hi, lo);
}
`,H=`
precision highp float;
precision highp sampler3D;
uniform highp sampler3D uNoise;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uRo, uRt, uUp, uFw;
uniform vec3 uSun, uSunCol, uSkyTop, uSkyHor, uFogCol, uSea, uAmbTop, uAmbBot;
uniform float uCov, uFog;
uniform vec2 uWind;
uniform sampler2D tHist;
uniform float uHistW, uFrame;
uniform vec3 uPRo, uPRt, uPUp, uPFw;

#define YB 0.0
#define YT 2.4
#define STEPS ${P}
#define LSTEPS ${F}
#define FOCAL ${L.toFixed(3)}
#define FAR 42.0
#define DENS 26.0
${B}

float hgN(float c, float g) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5); }
float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }

float cloud(vec3 p, bool detail, bool near) {
  float h = (p.y - YB) / (YT - YB);
  if (h <= 0.0 || h >= 1.0) return 0.0;
  vec3 q = p;
  q.xz += uWind;
  // weather: low-frequency coverage + how tall the cells are allowed to grow
  float wc = textureLod(uNoise, vec3(q.xz * 0.012, 0.31), 0.0).a;
  float cov = clamp(uCov + (wc - 0.5) * 1.1, 0.0, 1.0);
  // a flat-ish sea of cells (tops ≈ 1 unit) with the odd cumulus tower where the weather map peaks
  float topH = mix(0.36, 1.0, smoothstep(0.58, 0.95, wc + uCov * 0.25));
  float prof = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(topH * 0.35, topH, h));
  vec4 n = textureLod(uNoise, q * vec3(0.07, 0.09, 0.07), 0.0);
  float base = remap(n.r * prof, 1.0 - cov, 1.0, 0.0, 1.0);
  if (base <= 0.0) return 0.0;
  if (detail) {
    float dn = textureLod(uNoise, q * 0.3 + vec3(0.0, -uTime * 0.015, 0.0), 0.0).g;
    // wispy at the base, billowy at the top
    float m = mix(dn, 1.0 - dn, clamp(h * 6.0, 0.0, 1.0));
    base = remap(base, m * 0.38, 1.0, 0.0, 1.0);
  }
  if (near && base > 0.0) {
    // close to the camera: one more, finer erosion octave for crisp cauliflower edges
    float hn = textureLod(uNoise, q * 0.95 + vec3(uTime * 0.01, 0.0, 0.0), 0.0).b;
    base = remap(base, hn * 0.22, 1.0, 0.0, 1.0);
  }
  return clamp(base, 0.0, 1.0);
}

vec3 skyCol(vec3 rd, float cosT) {
  float y = max(rd.y, 0.0);
  vec3 c = mix(uSkyHor, uSkyTop, pow(smoothstep(0.0, 0.42, y), 0.55));
  c = mix(c, uFogCol, smoothstep(0.03, -0.06, rd.y));
  float cs = max(cosT, 0.0);
  c += uSunCol * (0.025 * cs * cs * cs + 0.06 * pow(cs, 24.0) + 0.3 * pow(cs, 600.0));
  c += uSunCol * smoothstep(0.99986, 0.99993, cosT) * 4.0;
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 rd = normalize(uFw * FOCAL + uv.x * uRt + uv.y * uUp);
  vec3 ro = uRo;
  float cosT = dot(rd, uSun);
  // dual-lobe HG (forward silver lining + a little back-scatter), softened per multi-scatter octave
  float ph1 = mix(hgN(cosT, 0.62), hgN(cosT, -0.2), 0.25);
  float ph2 = mix(hgN(cosT, 0.31), hgN(cosT, -0.1), 0.25);
  float ph3 = mix(hgN(cosT, 0.15), hgN(cosT, -0.05), 0.25);
  float cs = max(cosT, 0.0);
  vec3 fogC = uFogCol + uSunCol * (0.04 * cs * cs + 0.08 * pow(cs, 12.0));

  float tn = 0.0, tf = -1.0;
  if (abs(rd.y) > 1e-4) {
    float ta = (YB - ro.y) / rd.y, tb = (YT - ro.y) / rd.y;
    tn = max(min(ta, tb), 0.0);
    tf = min(max(ta, tb), FAR);
  } else if (ro.y > YB && ro.y < YT) {
    tf = FAR;
  }

  vec3 col = vec3(0.0);
  float T = 1.0;
  float tW = 0.0;
  if (tf > tn) {
    float t = tn + ign(gl_FragCoord.xy + 5.588238 * uFrame) * (0.1 + tn * 0.055);
    for (int i = 0; i < STEPS; i++) {
      if (t > tf || T < 0.015) break;
      float dt = clamp(0.1 + t * 0.055, 0.1, 1.6);
      vec3 p = ro + rd * t;
      float d = cloud(p, t < 16.0, t < 5.0);
      if (d > 0.002) {
        float od = 0.0;
        float ls = 0.05;
        vec3 lp = p;
        for (int j = 0; j < LSTEPS; j++) {
          lp += uSun * ls;
          od += cloud(lp, false, false) * ls;
          ls *= 1.9;
        }
        od *= DENS;
        float sig = d * DENS;
        float h = clamp((p.y - YB) / (YT - YB), 0.0, 1.0);
        vec3 sunL = uSunCol * (exp(-od) * ph1 + 0.3 * exp(-od * 0.3) * ph2 + 0.12 * exp(-od * 0.1) * ph3);
        // powder: dark creases on the side facing away from the sun, none when looking into it
        float powder = 1.0 - exp(-sig * 0.9);
        sunL *= mix(powder, 1.0, 0.45 + 0.55 * cs);
        float hh = clamp((p.y - YB) / 1.2, 0.0, 1.0);
        vec3 amb = mix(uAmbBot, uAmbTop, hh * hh * (3.0 - 2.0 * hh)) * (0.34 + 0.3 * exp(-od * 0.2));
        vec3 S = (sunL + amb) * sig;
        S = mix(S, fogC * sig, 1.0 - exp(-t * uFog));
        float tr = exp(-sig * dt);
        col += T * (S - S * tr) / sig;
        tW += T * (1.0 - tr) * t;
        T *= tr;
      }
      t += dt;
    }
  }

  vec3 bg;
  if (rd.y < 0.0 && ro.y > -4.0) {
    // the sea far below the cloud layer, lost in haze toward the horizon
    float ts = (-4.0 - ro.y) / rd.y;
    bg = mix(uSea, fogC, 1.0 - exp(-ts * uFog * 0.75));
    bg = mix(bg, skyCol(rd, cosT), smoothstep(-0.06, 0.0, rd.y));
  } else {
    bg = skyCol(rd, cosT);
  }
  col += T * bg;

  // source for the screen-space light shafts: sky we can see that is close to the sun
  float src = T * smoothstep(-0.05, 0.01, rd.y) * (0.35 * pow(cs, 50.0) + 2.2 * pow(cs, 500.0));
  // silver-lined cloud edges near the sun also cast streaks
  src += max(dot(col, vec3(0.3, 0.5, 0.2)) - 1.1, 0.0) * 0.5 * pow(cs, 10.0);
  // temporal accumulation: reproject this pixel's (transmittance-weighted) cloud depth into last frame
  float cov = 1.0 - T;
  float tr = cov > 0.02 ? tW / cov : 1e4;
  vec3 wp = ro + rd * mix(1e4, tr, smoothstep(0.02, 0.5, cov));
  vec3 dp = wp - uPRo;
  float z = dot(dp, uPFw);
  if (z > 0.0 && uHistW > 0.0) {
    vec2 pv = vec2(dot(dp, uPRt), dot(dp, uPUp)) / z * FOCAL;
    vec2 puv = vec2(pv.x * uRes.y / uRes.x, pv.y) + 0.5;
    if (all(greaterThan(puv, vec2(0.0))) && all(lessThan(puv, vec2(1.0)))) {
      vec4 h = textureLod(tHist, puv, 0.0);
      col = mix(col, h.rgb, uHistW);
      src = mix(src, h.a, uHistW);
    }
  }
  gl_FragColor = vec4(col, src);
}
`,U=`
precision highp float;
uniform sampler2D tA;
uniform vec2 uRes;
uniform vec2 uSunUV;
uniform float uRays;
uniform vec3 uSunCol;
uniform float uFade;
#define NS ${I}
${B}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  // upscale with a small tent filter: hides the jittered-march grain of the half-res buffer
  vec2 tx = 0.75 / vec2(textureSize(tA, 0));
  vec3 col = textureLod(tA, uv, 0.0).rgb * 0.4;
  col += textureLod(tA, uv + vec2(tx.x, tx.y), 0.0).rgb * 0.15;
  col += textureLod(tA, uv + vec2(-tx.x, tx.y), 0.0).rgb * 0.15;
  col += textureLod(tA, uv + vec2(tx.x, -tx.y), 0.0).rgb * 0.15;
  col += textureLod(tA, uv + vec2(-tx.x, -tx.y), 0.0).rgb * 0.15;
  // crepuscular rays: march toward the (possibly off-screen) sun over the unoccluded-sun mask
  vec2 dv = uSunUV - uv;
  float len = length(dv);
  dv *= min(1.0, 0.7 / max(len, 1e-4));
  vec2 st = dv / float(NS);
  vec2 q = uv + st * ign(gl_FragCoord.xy);
  float acc = 0.0, w = 1.0, ws = 0.0;
  for (int i = 0; i < NS; i++) {
    acc += textureLod(tA, q, 0.0).a * w;
    ws += w;
    w *= 0.955;
    q += st;
  }
  acc /= ws;
  // keep the scattering local to the sun's neighbourhood so it reads as shafts, not as a global wash
  vec2 ds = (uv - uSunUV) * vec2(uRes.x / uRes.y, 1.0);
  col += uSunCol * acc * uRays * exp(-dot(ds, ds) * 3.0);
  col = aces(col * 0.9);
  col = pow(col, vec3(1.0 / 2.2));
  vec2 sv = uv - 0.5;
  col *= 1.0 - dot(sv, sv) * 0.18;
  col += (ign(gl_FragCoord.xy + 7.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col * uFade, uFade);
}
`,W=(e,t=1)=>D(e).map(e=>e**2.2*t),G=[{key:`dawn`,zh:`日出`,en:`Sunrise`,el:3.5,az:22,top:`#5486dc`,hor:`#ffc89c`,fog:`#ebcdc6`,sea:`#47588f`,ambTop:`#879fdb`,ambBot:`#5d5a8c`,sun:`#ffb168`,sunK:3.8,rays:.6,dot:`#ff9f5a`},{key:`noon`,zh:`正午`,en:`Noon`,el:50,az:40,top:`#4c8ae0`,hor:`#d3e5f7`,fog:`#dce8f4`,sea:`#3f6299`,ambTop:`#a9c3ec`,ambBot:`#62799f`,sun:`#fff3e2`,sunK:2.8,rays:.4,dot:`#f5c542`},{key:`dusk`,zh:`黄昏`,en:`Dusk`,el:2.5,az:28,top:`#6670c2`,hor:`#ffb08e`,fog:`#e6b4ab`,sea:`#3c3b6e`,ambTop:`#958ccc`,ambBot:`#574872`,sun:`#ff9458`,sunK:3.5,rays:.7,dot:`#ff6f61`}],K=e=>({top:W(e.top),hor:W(e.hor),fog:W(e.fog),sea:W(e.sea),ambTop:W(e.ambTop,.9),ambBot:W(e.ambBot,.75),sun:W(e.sun,e.sunK),ang:[S.degToRad(e.el),S.degToRad(e.az),e.rays]}),q=[{zh:`稀疏`,v:.2},{zh:`中等`,v:.32},{zh:`浓密`,v:.46}],J=e=>2.6*Math.sin(e*.041)+1.2*Math.sin(e*.093+1.3),Y=e=>2.6*.041*Math.cos(e*.041)+1.2*.093*Math.cos(e*.093+1.3),X=e=>1.72+.16*Math.sin(e*.058+.4)+.06*Math.sin(e*.17+1);function Z({tod:e,cov:t,speed:n,px:r,py:i,scale:a}){let o=_(e=>e.gl),C=_(e=>e.size),T=(0,O.useMemo)(()=>{let e=new c(2,2),t=new u(-1,1,1,-1,0,1),n=t=>{let n=new d(e,t);n.frustumCulled=!1;let r=new v;return r.add(n),r},r=new x(R,R,R,{depthBuffer:!1}),i=r.texture;i.wrapS=i.wrapT=i.wrapR=f,i.minFilter=i.magFilter=h,i.generateMipmaps=!1;let a={uLayer:{value:0}},o=new l({vertexShader:z,fragmentShader:V,uniforms:a,depthTest:!1,depthWrite:!1,toneMapped:!1}),s={type:y,depthBuffer:!1,minFilter:h,magFilter:h},_=new m(4,4,s),b=new m(4,4,s),S={uNoise:{value:i},uRes:{value:new g(4,4)},uTime:{value:0},uRo:{value:new p},uRt:{value:new p},uUp:{value:new p},uFw:{value:new p},uSun:{value:new p(0,.1,-1).normalize()},uSunCol:{value:new p},uSkyTop:{value:new p},uSkyHor:{value:new p},uFogCol:{value:new p},uSea:{value:new p},uAmbTop:{value:new p},uAmbBot:{value:new p},uCov:{value:.5},uFog:{value:.021},uWind:{value:new g},tHist:{value:b.texture},uHistW:{value:0},uFrame:{value:0},uPRo:{value:new p},uPRt:{value:new p},uPUp:{value:new p},uPFw:{value:new p}},C=new l({vertexShader:z,fragmentShader:H,uniforms:S,depthTest:!1,depthWrite:!1,toneMapped:!1}),w={tA:{value:_.texture},uRes:{value:new g(4,4)},uSunUV:{value:new g(.5,.7)},uRays:{value:0},uSunCol:{value:new p},uFade:{value:0}},T=new l({vertexShader:z,fragmentShader:U,uniforms:w,depthTest:!1,depthWrite:!1,toneMapped:!1});return{geo:e,cam:t,vol:r,genU:a,genMat:o,genScene:n(o),fbo:_,fbo2:b,cu:S,cloudMat:C,cloudScene:n(C),pu:w,postMat:T,postScene:n(T)}},[]);(0,O.useEffect)(()=>()=>{T.geo.dispose(),T.vol.dispose(),T.fbo.dispose(),T.fbo2.dispose(),T.genMat.dispose(),T.cloudMat.dispose(),T.postMat.dispose()},[T]);let E=(0,O.useRef)(`compiling`);(0,O.useEffect)(()=>{let e=!0,t=o.getRenderTarget();o.setRenderTarget(T.vol,0);let n=o.compileAsync(T.genScene,T.cam);o.setRenderTarget(T.fbo);let r=o.compileAsync(T.cloudScene,T.cam);o.setRenderTarget(null);let i=o.compileAsync(T.postScene,T.cam);return o.setRenderTarget(t),Promise.all([n,r,i]).catch(()=>{}).then(()=>{e&&(E.current=`noise`)}),()=>{e=!1}},[T,o]);let D=(0,O.useMemo)(()=>({s:w?12.6:0,t:w?21:0,fade:0,flip:!1,frame:0,yaw:0,roll:0,buf:new g,ro:new p,fw:new p,rt:new p,up:new p,tmp:new p}),[]);return b((c,l)=>{let u=Math.min(l,1/30);if(E.current===`compiling`){o.setRenderTarget(null),o.setClearColor(0,0),o.clear();return}if(E.current===`noise`){for(let e=0;e<R;e++)T.genU.uLayer.value=e,o.setRenderTarget(T.vol,e),o.render(T.genScene,T.cam);o.setRenderTarget(null),E.current=`ready`}let d=n.get(),f=w?0:u;D.s+=f*.6*d,D.t+=f;let p=D.s,m=w?0:r.get(),h=w?0:i.get(),g=Math.atan(Y(p)),_=C.width<760,v=g+m*.24+(_?.2:0),y=(v-D.yaw)/Math.max(u,.001);D.yaw=v,D.roll=S.damp(D.roll,S.clamp(-y*1.6,-.2,.2)-m*.05,2.5,u);let b=(_?-.2:-.045)+h*.07+.015*Math.sin(D.t*.4);D.ro.set(J(p)+0,X(p)+.03*Math.sin(D.t*.7),-p),D.fw.set(Math.sin(v)*Math.cos(b),Math.sin(b),-Math.cos(v)*Math.cos(b)),D.rt.crossVectors(D.fw,s.DEFAULT_UP).normalize(),D.up.crossVectors(D.rt,D.fw);let x=Math.cos(D.roll),O=Math.sin(D.roll);D.tmp.copy(D.rt).multiplyScalar(x).addScaledVector(D.up,O),D.up.multiplyScalar(x).addScaledVector(D.rt,-O),D.rt.copy(D.tmp),o.getDrawingBufferSize(D.buf);let k=a.current,A=Math.max(16,Math.round(D.buf.x*k)),j=Math.max(16,Math.round(D.buf.y*k)),M=!1;(T.fbo.width!==A||T.fbo.height!==j)&&(T.fbo.setSize(A,j),T.fbo2.setSize(A,j),M=!0);let N=D.flip?T.fbo2:T.fbo,P=D.flip?T.fbo:T.fbo2;D.flip=!D.flip;let F=e.current,I=T.cu;I.uRes.value.set(A,j),I.uTime.value=D.t,I.uRo.value.copy(D.ro),I.uFw.value.copy(D.fw),I.uRt.value.copy(D.rt),I.uUp.value.copy(D.up);let[z,B,V]=F.ang;I.uSun.value.set(Math.sin(B)*Math.cos(z),Math.sin(z),-Math.cos(B)*Math.cos(z)),I.uSunCol.value.fromArray(F.sun),I.uSkyTop.value.fromArray(F.top),I.uSkyHor.value.fromArray(F.hor),I.uFogCol.value.fromArray(F.fog),I.uSea.value.fromArray(F.sea),I.uAmbTop.value.fromArray(F.ambTop),I.uAmbBot.value.fromArray(F.ambBot),I.uCov.value=t.current,I.uWind.value.set(D.t*.035,D.t*.012);let H=I.uSun.value,U=H.dot(D.fw),W=D.buf.x/D.buf.y,G=T.pu;G.uRes.value.copy(D.buf),U>.02&&G.uSunUV.value.set(L*H.dot(D.rt)/U/W+.5,L*H.dot(D.up)/U+.5),G.uRays.value=V*S.smoothstep(U,.02,.35),G.uSunCol.value.fromArray(F.sun),D.fade=Math.min(1,D.fade+u*.8),G.uFade.value=D.fade*D.fade*(3-2*D.fade),I.tHist.value=P.texture,I.uHistW.value=M||D.frame<2||u===0?0:.72,I.uFrame.value=D.frame%64,D.frame++,G.tA.value=N.texture,o.setRenderTarget(N),o.render(T.cloudScene,T.cam),I.uPRo.value.copy(D.ro),I.uPRt.value.copy(D.rt),I.uPUp.value.copy(D.up),I.uPFw.value.copy(D.fw),o.setRenderTarget(null),o.render(T.postScene,T.cam)},1),null}function Q(){let[e,t]=(0,O.useState)(0),[n,s]=(0,O.useState)(1),[c,l]=(0,O.useState)(1),u=(0,O.useRef)(K(G[0])),d=(0,O.useRef)(q[1].v),f=(0,O.useRef)(N),p=i(1,{stiffness:24,damping:12}),m=i(0,{stiffness:16,damping:11,mass:1.2}),h=i(0,{stiffness:16,damping:11,mass:1.2});(0,O.useEffect)(()=>{let t={};for(let[e,n]of Object.entries(u.current))t[e]=[...n];let n=K(G[e]),i=r(0,1,{duration:2.8,ease:[.45,0,.2,1],onUpdate:e=>{for(let r of Object.keys(n)){let i=t[r];for(let t=0;t<n[r].length;t++)u.current[r][t]=i[t]+(n[r][t]-i[t])*e}}});return()=>i.stop()},[e]),(0,O.useEffect)(()=>{let e=r(d.current,q[n].v,{duration:2.4,ease:[.45,0,.25,1],onUpdate:e=>d.current=e});return()=>e.stop()},[n]),(0,O.useEffect)(()=>p.set(c),[c,p]);let g=e=>{if(e.pointerType===`touch`)return;let t=e.currentTarget.getBoundingClientRect();m.set((e.clientX-t.left)/t.width*2-1),h.set(-((e.clientY-t.top)/t.height*2-1))},_=()=>{m.set(0),h.set(0)},v=(0,O.useRef)(null),y=e=>{e.pointerType!==`touch`||e.target.closest(`.dock, button, input, a`)||(v.current={id:e.pointerId,x:e.clientX,y:e.clientY})},b=e=>{let t=v.current;t&&t.id===e.pointerId&&(m.set(S.clamp((e.clientX-t.x)/140,-1,1)),h.set(S.clamp(-(e.clientY-t.y)/140,-1,1)))},x=()=>{v.current&&(v.current=null,_())},w=G[e];return(0,k.jsxs)(`div`,{className:`stage cs`,onPointerMove:e=>e.pointerType===`touch`?b(e):g(e),onPointerLeave:_,onPointerDown:y,onPointerUp:x,onPointerCancel:x,children:[(0,k.jsx)(`style`,{children:$}),(0,k.jsxs)(C,{dpr:M,gl:{antialias:!1,alpha:!0,powerPreference:`high-performance`},orthographic:!0,camera:{position:[0,0,1]},children:[(0,k.jsx)(E,{onDecline:()=>f.current=Math.max(.32,f.current*.85),onIncline:()=>f.current=Math.min(N,f.current*1.12),flipflops:4}),(0,k.jsx)(Z,{tod:u,cov:d,speed:p,px:m,py:h,scale:f})]}),(0,k.jsxs)(`div`,{className:`overlay`,children:[(0,k.jsxs)(a.div,{className:`hero-copy cs-copy`,initial:{opacity:0,y:12,filter:`blur(6px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},transition:{duration:1,delay:.4,ease:[.23,1,.32,1]},children:[(0,k.jsx)(`div`,{className:`scrim`}),(0,k.jsxs)(`p`,{className:`kicker`,children:[(0,k.jsx)(`i`,{style:{background:w.dot,boxShadow:`0 0 10px ${w.dot}`}}),` Volumetric · Henyey–Greenstein`]}),(0,k.jsx)(`h1`,{children:`在云上`}),(0,k.jsx)(`p`,{className:`cs-lede`,children:`云海由体积光线步进实时算出。低角度的阳光穿过云隙化作光束，逆光的云边镶上一圈金边。`}),(0,k.jsx)(`div`,{className:`cs-meta`,children:(0,k.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,k.jsxs)(a.span,{initial:{opacity:0,y:8,filter:`blur(4px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},exit:{opacity:0,y:-6,filter:`blur(4px)`},transition:{duration:.45,ease:[.23,1,.32,1]},children:[(0,k.jsx)(`b`,{style:{color:w.dot},children:w.en}),` · 太阳高度 `,w.el,`°`]},w.key)})})]}),(0,k.jsxs)(`div`,{className:`dock cs-dock`,children:[(0,k.jsx)(T,{items:G.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:t}),(0,k.jsx)(`span`,{className:`dock-sep`}),(0,k.jsx)(T,{items:q.map((e,t)=>({value:t,label:e.zh})),value:n,onChange:s}),(0,k.jsx)(`span`,{className:`dock-sep cs-sep2`}),(0,k.jsxs)(`label`,{className:`cs-range`,title:`飞行速度`,children:[(0,k.jsx)(`span`,{children:`航速`}),(0,k.jsx)(`input`,{type:`range`,min:0,max:3,step:.01,value:c,onChange:e=>l(Number(e.target.value)),style:{"--v":`${c/3*100}%`}})]})]}),(0,k.jsxs)(`p`,{className:`hint`,children:[`移动指针 · 轻轻转向`,(0,k.jsx)(`br`,{}),P,` steps × `,F,` sun taps · ½ res`]})]})]})}var $=`
.cs { background: linear-gradient(180deg, #a9c0e6 0%, #e9d3cf 34%, #f8dcc6 46%, #f3ece8 62%, #e8e4ea 100%); touch-action: none; }
.cs .cs-copy { --soft-bg: rgba(250, 244, 240, .8); }
.cs .cs-copy h1 { font-size: clamp(44px, 5.4vw, 76px); letter-spacing: -.04em; }
.cs .cs-lede { max-width: 350px; font-size: 15px; color: color-mix(in srgb, var(--fg) 72%, transparent); }
.cs-meta { margin-top: 22px; min-height: 20px; font: 500 12px/1.5 var(--mono); letter-spacing: .03em; color: var(--fg-2); }
.cs-meta span { display: inline-block; }
.cs-meta b { font-weight: 600; letter-spacing: .08em; text-transform: uppercase; margin-right: 2px; transition: color 1.2s; }
.cs .kicker i { transition: background 1.2s, box-shadow 1.2s; }
.cs-range { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px 0 8px; font: 500 13px/1 var(--sans); color: var(--fg-2); cursor: pointer; }
.cs-range input { -webkit-appearance: none; appearance: none; width: 92px; height: 18px; margin: 0; background: transparent; cursor: pointer; }
.cs-range input::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: linear-gradient(90deg, var(--fg) var(--v), color-mix(in srgb, var(--fg) 14%, transparent) var(--v)); }
.cs-range input::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.18); }
.cs-range input::-moz-range-track { height: 4px; border-radius: 4px; background: color-mix(in srgb, var(--fg) 14%, transparent); }
.cs-range input::-moz-range-progress { height: 4px; border-radius: 4px; background: var(--fg); }
.cs-range input::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: #fff; }
@media (max-width: 760px) {
  .cs .cs-copy { bottom: 136px; }
  .cs .cs-lede { font-size: 13.5px; }
  .cs-meta { display: none; }
  .cs-dock { flex-wrap: wrap; justify-content: center; row-gap: 2px; border-radius: 22px; width: max-content; }
  .cs-dock .seg { padding: 0 11px; }
  .cs-sep2 { display: none; }
}
`;export{Q as default};