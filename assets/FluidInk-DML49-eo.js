import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{n as a,r as o}from"./index-gQ65n0JU.js";import{Ht as s,Lt as c,N as l,Pt as u,Sn as d,Xt as f,Yt as p,h as m,it as h,jt as g,pt as _,u as v,vn as y,wt as b,yn as x}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as S}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as C}from"./iso-CLB38p39.js";import{t as w}from"./Seg-CH5KfWEm.js";import{t as T}from"./BigLabel-CceM23C6.js";var E=e(t(),1),D=`
uniform vec2 texelSize;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
void main() {
  vUv = uv;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,O=`
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
`,k=O+`
uniform sampler2D uTexture;
uniform float value;
void main() { gl_FragColor = value * texture2D(uTexture, vUv); }
`,A=O+`
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main() {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}
`,j=O+`
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 simTexel;
uniform float dt;
uniform float dissipation;
void main() {
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * simTexel;
  vec4 result = texture2D(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  gl_FragColor = result / decay;
}
`,M=O+`
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
`,N=O+`
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`,P=O+`
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main() {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = min(max(velocity, -1000.0), 1000.0);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`,F=O+`
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`,I=O+`
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`,L=O+`
uniform sampler2D uTexture;
uniform float threshold;
void main() {
  vec3 c = texture2D(uTexture, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float k = max(br - threshold, 0.0) / max(br, 1e-4);
  gl_FragColor = vec4(c * k, 1.0);
}
`,R=O+`
uniform sampler2D uTexture;
uniform vec2 dir;
void main() {
  vec3 c = texture2D(uTexture, vUv).rgb * 0.227027;
  vec2 o1 = dir * 1.3846153846;
  vec2 o2 = dir * 3.2307692308;
  c += texture2D(uTexture, vUv + o1).rgb * 0.3162162162;
  c += texture2D(uTexture, vUv - o1).rgb * 0.3162162162;
  c += texture2D(uTexture, vUv + o2).rgb * 0.0702702703;
  c += texture2D(uTexture, vUv - o2).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`,z=O+`
uniform sampler2D uDye;
uniform sampler2D uBloom;
uniform vec2 uTexel;
uniform vec3 uW;
uniform float uTime;
uniform vec2 uRes;
uniform float uPx;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec3 c = texture2D(uDye, vUv).rgb;
  vec3 bl = texture2D(uBloom, vUv).rgb;
  vec2 px = vUv * uRes * uPx;           // CSS pixels, so grain is DPR-independent
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  float vig = smoothstep(1.25, 0.15, length(q));
  float grain = hash(floor(px) + fract(uTime * 0.37) * 97.0) - 0.5;

  vec3 col = vec3(0.0);

  // ---- shaded dye (neon + aurora)
  if (uW.x + uW.z > 0.001) {
    // trim the faint haze left by long-diffused dye so the darks stay clean
    float cm = max(c.r, max(c.g, c.b));
    c *= smoothstep(0.0, 0.06, cm);
    vec3 lc = texture2D(uDye, vUv - vec2(uTexel.x, 0.0)).rgb;
    vec3 rc = texture2D(uDye, vUv + vec2(uTexel.x, 0.0)).rgb;
    vec3 tc = texture2D(uDye, vUv + vec2(0.0, uTexel.y)).rgb;
    vec3 bc = texture2D(uDye, vUv - vec2(0.0, uTexel.y)).rgb;
    float dx = length(rc) - length(lc);
    float dy = length(tc) - length(bc);
    vec3 n = normalize(vec3(dx, dy, length(uTexel)));
    float diffuse = clamp(dot(n, normalize(vec3(-0.35, 0.45, 1.0))) + 0.62, 0.66, 1.08);

    // neon: vivid dye on near-black, glow from the blurred buffer
    vec3 neon = c * diffuse * 1.25 + bl * 0.8;
    // hue-preserving soft clip (keeps saturated colours from washing to white), a touch of white-hot core
    float nm = max(neon.r, max(neon.g, neon.b));
    vec3 neonH = neon * (1.0 - exp(-nm * 1.5)) / max(nm, 1e-4);
    neon = mix(neonH, 1.0 - exp(-neon * 1.5), 0.25);
    neon += mix(vec3(0.010, 0.010, 0.018), vec3(0.035, 0.030, 0.055), vig);
    neon += grain * 0.014;
    col += neon * uW.x;

    // aurora: night sky gradient + faint twinkling stars behind cool dye
    vec3 sky = mix(vec3(0.008, 0.016, 0.035), vec3(0.025, 0.05, 0.085), smoothstep(0.0, 1.0, vUv.y));
    sky *= 0.55 + 0.45 * vig;
    vec2 cell = floor(px / 3.0);
    float sr = hash(cell * 1.37 + 4.1);
    float star = step(0.9984, sr) * (0.45 + 0.55 * sin(uTime * (1.2 + sr * 3.0) + sr * 90.0));
    sky += vec3(0.8, 0.9, 1.0) * max(star, 0.0) * 0.45 * (1.0 - clamp(length(c) * 4.0, 0.0, 1.0));
    vec3 aur = c * diffuse * 1.1 + bl * 1.3;
    float am = max(aur.r, max(aur.g, aur.b));
    aur = mix(aur * (1.0 - exp(-am * 1.4)) / max(am, 1e-4), 1.0 - exp(-aur * 1.4), 0.3);
    aur += sky + grain * 0.012;
    col += aur * uW.z;
  }

  // ---- ink wash on rice paper
  if (uW.y > 0.001) {
    float g1 = vnoise(px * 0.9);
    float g2 = vnoise(px * 0.21 + 7.0);
    float g3 = vnoise(px * 0.035 + 19.0);
    float grainP = g1 * 0.35 + g2 * 0.35 + g3 * 0.3;
    // fibres: thin, slightly curved streaks at a few orientations
    vec2 r1 = mat2(0.87, 0.5, -0.5, 0.87) * px;
    vec2 r2 = mat2(0.34, -0.94, 0.94, 0.34) * px;
    float f1 = vnoise(vec2(r1.x * 0.03 + vnoise(px * 0.02) * 2.0, r1.y * 0.55));
    float f2 = vnoise(vec2(r2.x * 0.025 + 3.0, r2.y * 0.6 + vnoise(px * 0.015) * 2.0));
    float fib = smoothstep(0.78, 0.95, f1) * 0.6 + smoothstep(0.8, 0.96, f2) * 0.5;
    vec3 paper = vec3(0.945, 0.915, 0.858);
    paper *= 0.965 + 0.06 * grainP;
    paper -= fib * vec3(0.016, 0.017, 0.02);
    paper += vec3(0.012, 0.008, 0.0) * (g3 - 0.5);
    paper *= mix(0.9, 1.0, vig);

    float d = max(c.r, max(c.g, c.b));
    float db = max(bl.r, max(bl.g, bl.b));
    float absorb = mix(0.82, 1.12, grainP) * (1.0 + fib * 0.1);
    float core = 1.0 - exp(-d * 1.7 * absorb);
    float halo = 1.0 - exp(-db * 1.5);
    float t = max(core, halo * 0.42);
    // pigment collects at the rim of a wet stroke
    float rim = smoothstep(0.04, 0.22, core) * (1.0 - smoothstep(0.3, 0.75, core));
    t = clamp(t + rim * 0.1, 0.0, 1.0);
    vec3 inkLight = vec3(0.47, 0.45, 0.43);
    vec3 inkDark = vec3(0.05, 0.05, 0.062);
    vec3 inkCol = mix(inkLight, inkDark, smoothstep(0.18, 0.92, t));
    vec3 ink = mix(paper, inkCol, smoothstep(0.0, 0.85, t));
    ink += grain * 0.02;
    col += ink * uW.y;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;function B(e,t,n){let r=n?_:g;return new d(e,t,{type:h,format:s,minFilter:r,magFilter:r,wrapS:l,wrapT:l,depthBuffer:!1,stencilBuffer:!1,generateMipmaps:!1})}function V(e,t,n){let r={read:B(e,t,n),write:B(e,t,n),swap(){let e=r.read;r.read=r.write,r.write=e}};return r}function H(e,t,n){let r=t/n;r<1&&(r=1/r);let i=Math.round(e),a=Math.round(e*r);return t>n?{w:a,h:i}:{w:i,h:a}}var U=class{renderer;scene=new p;cam=new u(-1,1,1,-1,0,1);quad;mats={};simRes;dyeRes;W=0;H=0;sw=0;sh=0;dw=0;dh=0;velocity;dye;pressure;divergence;curl;bloomA;bloomB;display;iterations=20;constructor(e,t,n){this.renderer=e,this.simRes=t,this.dyeRes=n;let r=(e,t)=>new f({vertexShader:D,fragmentShader:e,uniforms:{texelSize:{value:new y},...t},depthTest:!1,depthWrite:!1}),i=()=>({value:null});this.mats.copy=r(k,{uTexture:i(),value:{value:1}}),this.mats.splat=r(A,{uTarget:i(),aspectRatio:{value:1},color:{value:new x},point:{value:new y},radius:{value:.0025}}),this.mats.advect=r(j,{uVelocity:i(),uSource:i(),simTexel:{value:new y},dt:{value:0},dissipation:{value:0}}),this.mats.divergence=r(M,{uVelocity:i()}),this.mats.curl=r(N,{uVelocity:i()}),this.mats.vorticity=r(P,{uVelocity:i(),uCurl:i(),curl:{value:0},dt:{value:0}}),this.mats.pressure=r(F,{uPressure:i(),uDivergence:i()}),this.mats.gradient=r(I,{uPressure:i(),uVelocity:i()}),this.mats.prefilter=r(L,{uTexture:i(),threshold:{value:.2}}),this.mats.blur=r(R,{uTexture:i(),dir:{value:new y}}),this.display=r(z,{uDye:i(),uBloom:i(),uTexel:{value:new y},uW:{value:new x(1,0,0)},uTime:{value:0},uRes:{value:new y(1,1)},uPx:{value:1}}),this.quad=new b(new c(2,2),this.mats.copy),this.quad.frustumCulled=!1,this.scene.add(this.quad)}blit(e,t,n){n&&e.uniforms.texelSize.value.set(n.x,n.y),this.quad.material=e,this.renderer.setRenderTarget(t),this.renderer.render(this.scene,this.cam)}copyInto(e,t){let n=this.mats.copy;n.uniforms.uTexture.value=e.texture,n.uniforms.value.value=1,this.blit(n,t,{x:1/t.width,y:1/t.height})}resize(e,t){if(e===this.W&&t===this.H)return!1;this.W=e,this.H=t;let n=H(this.simRes,e,t),r=H(this.dyeRes,e,t),i=H(Math.max(64,Math.round(this.dyeRes/4)),e,t),a=this.velocity,o=this.dye;return this.velocity=V(n.w,n.h,!0),this.dye=V(r.w,r.h,!0),a&&(this.copyInto(a.read,this.velocity.read),this.copyInto(o.read,this.dye.read),[a.read,a.write,o.read,o.write].forEach(e=>e.dispose()),[this.pressure.read,this.pressure.write,this.divergence,this.curl,this.bloomA,this.bloomB].forEach(e=>e.dispose())),this.pressure=V(n.w,n.h,!1),this.divergence=B(n.w,n.h,!1),this.curl=B(n.w,n.h,!1),this.bloomA=B(i.w,i.h,!0),this.bloomB=B(i.w,i.h,!0),this.sw=n.w,this.sh=n.h,this.dw=r.w,this.dh=r.h,!0}splat(e,t,n,r,i,a,o,s){let c=this.mats.splat,l=this.W/this.H;c.uniforms.aspectRatio.value=l,c.uniforms.point.value.set(e,t),c.uniforms.radius.value=s/100*(l>1?l:1),c.uniforms.uTarget.value=this.velocity.read.texture,c.uniforms.color.value.set(n,r,0),this.blit(c,this.velocity.write,{x:1/this.sw,y:1/this.sh}),this.velocity.swap(),c.uniforms.uTarget.value=this.dye.read.texture,c.uniforms.color.value.set(i,a,o),this.blit(c,this.dye.write,{x:1/this.dw,y:1/this.dh}),this.dye.swap()}step(e,t){let n={x:1/this.sw,y:1/this.sh},r=this.mats;r.curl.uniforms.uVelocity.value=this.velocity.read.texture,this.blit(r.curl,this.curl,n),r.vorticity.uniforms.uVelocity.value=this.velocity.read.texture,r.vorticity.uniforms.uCurl.value=this.curl.texture,r.vorticity.uniforms.curl.value=t.curl,r.vorticity.uniforms.dt.value=e,this.blit(r.vorticity,this.velocity.write,n),this.velocity.swap(),r.divergence.uniforms.uVelocity.value=this.velocity.read.texture,this.blit(r.divergence,this.divergence,n),r.copy.uniforms.uTexture.value=this.pressure.read.texture,r.copy.uniforms.value.value=t.pressure,this.blit(r.copy,this.pressure.write,n),this.pressure.swap(),r.pressure.uniforms.uDivergence.value=this.divergence.texture;for(let e=0;e<this.iterations;e++)r.pressure.uniforms.uPressure.value=this.pressure.read.texture,this.blit(r.pressure,this.pressure.write,n),this.pressure.swap();r.gradient.uniforms.uPressure.value=this.pressure.read.texture,r.gradient.uniforms.uVelocity.value=this.velocity.read.texture,this.blit(r.gradient,this.velocity.write,n),this.velocity.swap();let i=r.advect;i.uniforms.simTexel.value.set(n.x,n.y),i.uniforms.dt.value=e,i.uniforms.uVelocity.value=this.velocity.read.texture,i.uniforms.uSource.value=this.velocity.read.texture,i.uniforms.dissipation.value=t.velDiss,this.blit(i,this.velocity.write,n),this.velocity.swap(),i.uniforms.uVelocity.value=this.velocity.read.texture,i.uniforms.uSource.value=this.dye.read.texture,i.uniforms.dissipation.value=t.dyeDiss,this.blit(i,this.dye.write,{x:1/this.dw,y:1/this.dh}),this.dye.swap();let a={x:1/this.bloomA.width,y:1/this.bloomA.height};r.prefilter.uniforms.uTexture.value=this.dye.read.texture,r.prefilter.uniforms.threshold.value=t.threshold,this.blit(r.prefilter,this.bloomA,a);for(let e=0;e<2;e++){let t=1+e*1.5;r.blur.uniforms.uTexture.value=this.bloomA.texture,r.blur.uniforms.dir.value.set(a.x*t,0),this.blit(r.blur,this.bloomB,a),r.blur.uniforms.uTexture.value=this.bloomB.texture,r.blur.uniforms.dir.value.set(0,a.y*t),this.blit(r.blur,this.bloomA,a)}}render(e,t){let n=this.display.uniforms;n.uDye.value=this.dye.read.texture,n.uBloom.value=this.bloomA.texture,n.uTexel.value.set(1/this.dw,1/this.dh),n.uRes.value.set(this.W,this.H),n.uTime.value=e,n.uPx.value=t,this.blit(this.display,null)}dispose(){[this.velocity.read,this.velocity.write,this.dye.read,this.dye.write,this.pressure.read,this.pressure.write,this.divergence,this.curl,this.bloomA,this.bloomB].forEach(e=>e?.dispose()),Object.values(this.mats).forEach(e=>e.dispose()),this.display.dispose(),this.quad.geometry.dispose()}},W=n(),G=e=>{let t=parseInt(e.slice(1),16);return[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255]},K=[{key:`neon`,zh:`霓虹`,en:`Neon`,sub:`高饱和染料在近黑底上涡旋，叠一层柔光`,aside:`curl 30 · glow`,p:{curl:30,velDiss:.22,dyeDiss:.7,pressure:.8,threshold:.12,radius:.22,force:5200,amount:.22},colors:[`#ff2a7a`,`#ff5a36`,`#ff2fd0`,`#8a3dff`,`#2f6bff`,`#18d8ff`].map(G)},{key:`ink`,zh:`水墨`,en:`Ink Wash`,sub:`墨在宣纸上晕开，浓淡随笔势变化`,aside:`curl 6 · paper grain`,p:{curl:6,velDiss:.9,dyeDiss:.2,pressure:.8,threshold:0,radius:.28,force:3e3,amount:.085},colors:[[1,1,1]]},{key:`aurora`,zh:`极光`,en:`Aurora`,sub:`青绿与紫罗兰在夜空里缓慢交织`,aside:`curl 18 · night sky`,p:{curl:18,velDiss:.35,dyeDiss:.55,pressure:.8,threshold:.04,radius:.34,force:4200,amount:.16},colors:[`#1ff2a0`,`#14c6c9`,`#2f8cff`,`#6f5bff`,`#b25cff`,`#4dffcf`].map(G)}],q=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,J=q?96:128,Y=q?512:1024;function X(e,t,n){let r=e.length,i=(t%r+r)%r,a=Math.floor(i),o=i-a,s=o*o*(3-2*o),c=e[a],l=e[(a+1)%r];n[0]=c[0]+(l[0]-c[0])*s,n[1]=c[1]+(l[1]-c[1])*s,n[2]=c[2]+(l[2]-c[2])*s}function Z({ptr:e,w:t,flush:n,modeIdx:r,kick:i}){let a=m(e=>e.gl),o=(0,E.useMemo)(()=>new U(a,J,Y),[a]);(0,E.useEffect)(()=>()=>o.dispose(),[o]);let s=(0,E.useRef)({time:0,hue:Math.random()*6,ghostT:Math.random()*50,gx:-1,gy:-1,puff:.6,seeded:!1,kick:0}),c=(0,E.useRef)([0,0,0]),l=(0,E.useRef)({curl:0,velDiss:0,dyeDiss:0,pressure:.8,threshold:0,radius:0,force:0,amount:0});return v((u,d)=>{let f=Math.min(d,1/60),p=s.current;p.time+=d;let m=a.domElement;o.resize(m.width,m.height);let h=m.width/m.height,g=[t[0].get(),t[1].get(),t[2].get()],_=l.current;for(let e of Object.keys(_))_[e]=g[0]*K[0].p[e]+g[1]*K[1].p[e]+g[2]*K[2].p[e];let v=K[r.current],y=v.key===`ink`,b=(e,t=0,n=1)=>{if(y){let t=e*n;c.current[0]=t,c.current[1]=t,c.current[2]=t}else X(v.colors,p.hue+t,c.current),c.current[0]*=e,c.current[1]*=e,c.current[2]*=e;return c.current},x=e=>{let t=.3+Math.random()*.4,n=.08+Math.random()*.45,r=.35+Math.random()*.3,i=Math.random()*6,a=Math.random()*6;for(let s=0;s<16;s++){let l=s/15,u=n+r*l,d=t+Math.sin(l*5+i)*.06;X(v.colors,a+l*1.6,c.current);let f=.22*e*(.6+.4*Math.sin(l*Math.PI));o.splat(u,d,Math.cos(l*5+i)*120,(240+Math.random()*160)*e,c.current[0]*f,c.current[1]*f,c.current[2]*f,_.radius*.45)}},S=e=>{let t=.15+Math.random()*.7,n=.15+Math.random()*.7,r=Math.random()*Math.PI*2,i=(Math.random()-.5)*2.4,a=.08+Math.random()*.1,s=.3+Math.random()*.45;for(let c=0;c<9;c++){let l=c/8,u=r+i*l,d=t+Math.cos(u)*a*l,f=n+Math.sin(u)*a*l*h,p=s*(1-l*.75)*e;o.splat(d,f,Math.cos(u)*260,Math.sin(u)*260,p,p,p,_.radius*(.55-l*.3))}},w=(e=1)=>{if(v.key===`aurora`)return x(e);if(y)return S(e);let t=.15+Math.random()*.7,n=.15+Math.random()*.7,r=Math.random()*Math.PI*2,i=(900+Math.random()*700)*e,a=b(y?.25+Math.random()*.45:.6+Math.random()*.4,Math.random()*6,1);o.splat(t,n,Math.cos(r)*i,Math.sin(r)*i,a[0],a[1],a[2],_.radius*(.6+Math.random()*.6))};if(!p.seeded){if(p.seeded=!0,C)for(let e=0;e<12;e++){let t=e/11,n=.14+.72*t,r=.5+.16*Math.sin(t*6.2),i=Math.cos(t*6.2)*.9+(e%2?1.2:-1.2),a=b(.75,t*5,1);o.splat(n,r,Math.cos(i)*520,Math.sin(i)*520,a[0],a[1],a[2],_.radius*1.1)}else for(let e=0;e<7;e++)w(1.2)}if(i.current!==p.kick){p.kick=i.current;for(let e=0;e<(v.key===`aurora`?2:4);e++)w(v.key===`aurora`?.9:1.1)}p.hue+=f*.6;let T=(e,t,n,r,i)=>{let a=n-e,s=r-t;h<1&&(a*=h),h>1&&(s/=h);let c=Math.hypot((n-e)*h,r-t);if(c<1e-5)return;let l=Math.min(12,Math.max(1,Math.ceil(c/.01))),u=_.radius/100*Math.max(h,1),d=Math.min(l,Math.max(1,Math.sqrt(Math.PI*u)/(c/l))),p=c/Math.max(f,1/240),m=y?1.2-Math.min(.7,p*.3):1,g=Math.min(1,Math.max(y?.03:.35,c/.012)),v=b(_.amount*i*2.2*g/d,0,m),x=a*_.force*i/d,S=s*_.force*i/d;for(let i=1;i<=l;i++){let a=i/l;o.splat(e+(n-e)*a,t+(r-t)*a,x,S,v[0],v[1],v[2],_.radius)}},E=e.current;for(E.moved&&(E.moved=!1,E.px>=0&&T(E.px,E.py,E.x,E.y,1),E.px=E.x,E.py=E.y);E.bursts.length;){let e=E.bursts.shift(),t=b(y?.75:1.6,0,1);o.splat(e.x,e.y,0,0,t[0],t[1],t[2],_.radius*1.8);for(let t=0;t<8;t++){let n=t/8*Math.PI*2+Math.random()*.3,r=y?420:650,i=b(y?.12:.18,t*.4,1);o.splat(e.x+Math.cos(n)*.02,e.y+Math.sin(n)*.02*h,Math.cos(n)*r,Math.sin(n)*r,i[0],i[1],i[2],_.radius*1.4)}}if(C||performance.now()-E.last>2600){p.ghostT+=f;let e=p.ghostT,t=Math.sin(e*.8)>-.35,n=.5+.33*Math.sin(e*.41+Math.sin(e*.17)*1.6),r=.5+.27*Math.sin(e*.59+1.3)+.06*Math.sin(e*1.3);t&&p.gx>=0&&T(p.gx,p.gy,n,r,y?.75:.6),p.gx=t?n:-1,p.gy=r,p.puff-=f,p.puff<=0&&(p.puff=y?2.8+Math.random()*1.6:1.1+Math.random()*1.1,w(.8))}else p.gx=-1;let D=n.get();o.step(f,{curl:_.curl,velDiss:_.velDiss,dyeDiss:_.dyeDiss*(C?.3:1)+D,pressure:_.pressure,threshold:_.threshold}),o.display.uniforms.uW.value.set(g[0],g[1],g[2]),o.render(p.time,1/u.viewport.dpr)},1),null}function Q(){let[e,t]=(0,E.useState)(0),n=(0,E.useRef)(e),s=(0,E.useRef)(0),c=(0,E.useRef)(null),l=(0,E.useRef)({x:0,y:0,px:-1,py:-1,moved:!1,inside:!1,last:-1e9,bursts:[]}),u=i(1),d=i(0),f=i(0),p=i(0),m=(0,E.useMemo)(()=>[u,d,f],[u,d,f]),h=(0,E.useRef)(!0);(0,E.useEffect)(()=>{n.current=e;let t=m.map((t,n)=>r(t,+(n===e),{duration:1.1,ease:[.45,0,.2,1]}));return h.current?(h.current=!1,m.forEach((t,n)=>t.set(+(n===e)))):(s.current++,p.set(3.2),t.push(r(p,0,{duration:1.6,ease:`easeOut`}))),()=>t.forEach(e=>e.stop())},[e,m,p]),(0,E.useEffect)(()=>{let e=c.current,t=t=>{let n=e.getBoundingClientRect();return[(t.clientX-n.left)/n.width,1-(t.clientY-n.top)/n.height]},n=e=>{let n=l.current,[r,i]=t(e);r<0||r>1||i<0||i>1||(performance.now()-n.last>120&&(n.px=r,n.py=i),n.x=r,n.y=i,n.moved=!0,n.last=performance.now())},r=e=>{let n=l.current,[r,i]=t(e);n.bursts.push({x:r,y:i}),n.px=r,n.py=i,n.x=r,n.y=i,n.last=performance.now()};return window.addEventListener(`pointermove`,n),e.addEventListener(`pointerdown`,r),()=>{window.removeEventListener(`pointermove`,n),e.removeEventListener(`pointerdown`,r)}},[]);let g=K[e],_=g.key===`ink`;return(0,W.jsxs)(`div`,{className:`stage fi-root`,"data-mode":g.key,style:{background:_?`#efe7d6`:`#07070c`},children:[(0,W.jsx)(`style`,{children:$}),(0,W.jsx)(`div`,{ref:c,className:`fi-canvas`,children:(0,W.jsx)(S,{dpr:[1,2],gl:{antialias:!1,alpha:!1,powerPreference:`high-performance`},camera:{position:[0,0,1]},children:(0,W.jsx)(Z,{ptr:l,w:m,flush:p,modeIdx:n,kick:s})})}),(0,W.jsxs)(`div`,{className:`overlay fi-overlay`,children:[(0,W.jsxs)(`div`,{className:`fi-label soft-text`,children:[(0,W.jsx)(T,{id:g.key,meta:`${String(e+1).padStart(2,`0`)} / 03 · STABLE FLUIDS · ${J}² SIM / ${Y}² DYE`,title:g.zh,sub:g.sub,aside:g.aside}),(0,W.jsx)(o,{children:_&&(0,W.jsxs)(a.span,{className:`fi-seal`,"aria-hidden":!0,initial:{opacity:0,scale:1.25,rotate:-8},animate:{opacity:1,scale:1,rotate:-3},exit:{opacity:0,scale:.9},transition:{type:`spring`,stiffness:380,damping:18,delay:.35},children:[(0,W.jsx)(`b`,{children:`水`}),(0,W.jsx)(`b`,{children:`墨`})]})})]}),(0,W.jsx)(`div`,{className:`dock`,children:(0,W.jsx)(w,{items:K.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:t})}),(0,W.jsx)(`p`,{className:`hint`,children:`拖动鼠标搅动 · 点击溅开`})]})]})}var $=`
.fi-canvas { position: absolute; inset: 0; touch-action: none; cursor: crosshair; }
.fi-root { transition: background .8s; }
.fi-overlay { transition: color .8s; }
.fi-label { --soft-bg: #07070c; }
.fi-root[data-mode='ink'] .fi-label { --soft-bg: #efe7d6; }
.fi-label .big-label-meta { font-size: 11px; letter-spacing: .1em; }
.fi-seal {
  position: absolute; left: clamp(24px, 6vw, 96px); bottom: calc(104px + 132px);
  display: grid; grid-template-columns: 1fr; place-items: center; gap: 0;
  width: 38px; padding: 5px 0; border-radius: 4px;
  background: #b8322a; color: #f6e9dc;
  font: 600 15px/1.15 'STKaiti', 'KaiTi', 'Kaiti SC', serif;
  box-shadow: inset 0 0 0 2px #b8322a, inset 0 0 0 3.5px rgba(246,233,220,.75);
  pointer-events: none;
}
.fi-seal b { font-weight: 600 }
/* 水墨: the whole page (including the demo chrome) switches to a light, paper-toned scheme */
.demo-page:has(.fi-root[data-mode='ink']) {
  --fg: #1f1c18;
  --fg-2: rgba(31, 28, 24, .62);
  --glass: rgba(250, 245, 236, .6);
  --glass-line: rgba(31, 28, 24, .1);
  color-scheme: light;
}
.demo-page:has(.fi-root) .chip { transition: background .6s, color .6s; }
@media (max-width: 760px) {
  .fi-label .big-label p span { display: none; }
  .fi-seal { bottom: calc(92px + 112px); }
  .fi-label .big-label-meta { font-size: 10px; }
}
`;export{Q as default};