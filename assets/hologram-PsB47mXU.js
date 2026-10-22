import{bn as e,vn as t,xt as n,yn as r}from"./events-9ce18a08.esm-BJiOHOtz.js";var i=[{id:`starwars`,label:`星战`},{id:`cyber`,label:`赛博`},{id:`medical`,label:`医疗`}],a={title:`全息投影`,en:`Hologram`,background:`#02070d`,theme:`dark`},o={starwars:`#8cc8ff`,cyber:`#3ef2ff`,medical:`#4dffb8`};function s(e){return e.blending=0,e.transparent=!1,e.opacity=.25,e.needsUpdate=!0,e}var c={starwars:{colA:[.36,.2,.18],colB:[.18,.5,.52],colC:[.04,.12,.42],tint:[.5,.75,1],scanP:4.2,scanS:.62,scanV:16,sweep:.55,pix:2.5,chunk:3,noise:.75,wire:0,grid:0,dispB:.8,dispE:2.6,jit:1.3,flick:.16,med:0,gain:1.05},cyber:{colA:[.42,.06,.36],colB:[.1,.78,.8],colC:[0,.16,.34],tint:[.3,.95,1],scanP:3,scanS:.2,scanV:28,sweep:.35,pix:1,chunk:1.5,noise:.3,wire:1,grid:1,dispB:.6,dispE:4.2,jit:0,flick:.03,med:0,gain:.95},medical:{colA:[.1,.32,.12],colB:[.12,.6,.42],colC:[.02,.1,.2],tint:[.3,1,.72],scanP:5,scanS:.3,scanV:10,sweep:0,pix:1,chunk:2,noise:.35,wire:.35,grid:0,dispB:.4,dispE:1.8,jit:.2,flick:.05,med:1,gain:1}},l=(e,t,n)=>{let r={};for(let i of Object.keys(e)){let a=e[i],o=t[i];r[i]=Array.isArray(a)?a.map((e,t)=>e+(o[t]-e)*n):a+(o-a)*n}return r},u=`
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform vec3 uTint;
uniform vec4 uScan;     // period, depth, speed, sweep
uniform vec4 uLook;     // pix, chunk, noise, wire
uniform vec4 uLook2;    // dispersion base, edge, line jitter, graticule
uniform vec4 uMisc;     // flicker mult, gain, medical, slice y (0..1 from the bottom)
uniform vec4 uBand;     // y0, y1 (0..1 from the bottom), shift CSS px, on
uniform vec2 uSig;      // vertical roll CSS px, seed
uniform vec4 uCone;     // lens x, y (CSS px from the bottom-left), top half-width, height
uniform vec4 uCone2;    // lens half-width, disc rx, disc ry, amount
uniform vec2 uSliceX;   // horizontal extent of the slicing plane, 0..1

vec4 nrmL(vec2 p) { return textureLod(tNormal, p / uRes, 0.0); }
vec4 colL(vec2 p) { return textureLod(tScene, p / uRes, 0.0); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

// x = light, y = fresnel, z = hologram coverage, w = scene luma; nn = view normal
vec4 tapAt(vec2 p, out vec3 nn) {
  vec4 n = nrmL(p);
  vec4 c = colL(p);
  float cov = n.a * smoothstep(0.45, 0.85, c.a);
  nn = normalize(n.rgb * 2.0 - 1.0);
  float f = clamp(nn.z, 0.0, 1.0);
  float fres = (1.0 - f) * (1.0 - f);
  // display-ish luma without three pow()s per tap (cheap to compile on D3D)
  float L = sqrt(clamp(luma(c.rgb * uExposure), 0.0, 1.0));
  float I = 0.04 + 1.05 * fres + 0.5 * L * L * (0.3 + 0.7 * f) + 0.12 * L;
  return vec4(I * cov, fres * cov, cov, L);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 res = uRes / uDpr;
  vec2 uv = cp / res;
  float seed = uSig.y;

  /* ---- signal: vertical re-sync jump, sheared band, per-line jitter, low-res blocks */
  vec2 q = cp;
  q.y += uSig.x;
  float yN = q.y / res.y;
  float band = uBand.w * step(uBand.x, yN) * step(yN, uBand.y);
  float row = floor(q.y / 2.0);
  q.x += band * (uBand.z + (hash12(vec2(row, seed)) - 0.5) * 7.0);
  q.x += (hash12(vec2(row, floor(uTime * 20.0))) - 0.5) * uLook2.z;
  if (uLook.x > 1.01) q = (floor(q / uLook.x) + 0.5) * uLook.x;

  /* ---- taps (one call site): 0 centre, 1/2 dispersion ±d, 3–8 ring at 1.6 px (creases, outline,
     graticule), 9–14 halo ring at 7 / 15 px */
  vec2 dir = vec2(1.0, 0.16);
  float d = 0.0;
  vec3 nC = vec3(0.0, 0.0, 1.0);
  float covC = 0.0, fresC = 0.0;
  vec3 I3 = vec3(0.0);
  float crease = 0.0, iso = 0.0, sil = 0.0, halo = 0.0;
  for (int i = 0; i < 15; i++) {
    float k = float(i);
    vec2 o = vec2(0.0);
    if (i == 1) o = dir * d;
    else if (i == 2) o = -dir * d;
    else if (i > 2 && i < 9) { float a = (k - 3.0) * 1.0472 + 0.3; o = vec2(cos(a), sin(a)) * 1.6; }
    else if (i >= 9) { float a = (k - 9.0) * 1.0472 + 0.82; o = vec2(cos(a), sin(a)) * (mod(k, 2.0) < 0.5 ? 7.0 : 15.0); }
    vec3 nn;
    vec4 t = tapAt((q + o) * uDpr, nn);
    if (i == 0) {
      nC = nn; covC = t.z; fresC = t.y; I3.y = t.x;
      d = uLook2.x + uLook2.y * mix(1.0, fresC, covC) + band * 5.0;
    }
    else if (i == 1) I3.x = t.x;
    else if (i == 2) I3.z = t.x;
    else if (i < 9) {
      float both = covC * t.z;
      crease = max(crease, (1.0 - dot(nC, nn)) * both);
      vec2 qa = floor(nC.xy * 5.0), qb = floor(nn.xy * 5.0);
      iso = max(iso, both * step(0.5, abs(qa.x - qb.x) + abs(qa.y - qb.y)));
      sil = max(sil, abs(t.z - covC));
    }
    else halo += t.z * (0.3 + t.y);
  }
  halo /= 6.0;

  /* ---- hologram light */
  vec3 holo = uColA * I3.x + uColB * I3.y + uColC * I3.z;
  float wire = smoothstep(0.05, 0.22, crease) * 0.9 + sil * 0.7;
  holo += uTint * (wire * uLook.w * 0.8 + iso * uLook2.w * 0.3);
  holo += uTint * halo * 0.2;

  // scanlines scroll upward; a slow brighter sweep rides up the image
  float ph = (cp.y - uTime * uScan.z) / uScan.x;
  float sl = 0.5 + 0.5 * cos(ph * 6.2832);
  float scan = 1.0 - uScan.y * (1.0 - sl * sl);
  float sweepY = fract(uTime * 0.09) * 1.5 - 0.25;
  float sw = (uv.y - sweepY) * 9.0;
  float sweep = exp(-sw * sw) * uScan.w;
  holo *= scan * (1.0 + sweep * 1.4 + band * 0.3);

  // data noise: stepped sparkles and short dashes, only on / around the subject
  float near = clamp(covC + halo * 2.2, 0.0, 1.0);
  vec2 cell = floor(q / uLook.y);
  float spark = step(1.0 - 0.012 * uLook.z, hash12(cell + seed * 7.13)) * near;
  float dash = step(1.0 - 0.006 * uLook.z, hash12(vec2(floor(q.x / 16.0), floor(q.y / uLook.y)) + seed * 3.1)) * near;
  holo += uTint * (spark * 0.8 + dash * 0.3);

  // medical: a slicing plane — bright cut line, cross-section fill + depth contours around it, ruler ticks
  if (uMisc.z > 0.01) {
    float dy = cp.y - uMisc.w * res.y;
    float span = smoothstep(uSliceX.x - 0.03, uSliceX.x + 0.03, uv.x) * (1.0 - smoothstep(uSliceX.y - 0.03, uSliceX.y + 0.03, uv.x));
    float cut = exp(-dy * dy / 2.5) * span;
    float zone = exp(-dy * dy / (2.0 * 38.0 * 38.0));
    float z = depthAt(q * uDpr);
    float ct = abs(fract(z * 7.0) - 0.5);
    float contour = smoothstep(0.38, 0.48, ct) * covC;
    float tick = span * step(fract(cp.x / 12.0), 0.12) * step(0.0, dy) * step(dy, mod(floor(cp.x / 12.0), 5.0) < 0.5 ? 9.0 : 5.0);
    vec3 m = uTint * (cut * (0.35 + 1.4 * covC) + zone * (contour * 0.9 + covC * 0.25) + tick * 0.35);
    holo = holo * (1.0 - 0.3 * uMisc.z * (1.0 - zone)) + m * uMisc.z;
  }
  holo *= uMisc.x * uMisc.y;

  /* ---- what is behind: a dim room (dot grid) or a solid, real object */
  vec2 vc = uv - 0.5;
  vec2 va = vc * vec2(res.x / res.y, 1.0);
  float vig = dot(va, va);
  vec3 env = mix(vec3(0.004, 0.01, 0.018), vec3(0.012, 0.028, 0.045), smoothstep(0.0, 1.0, uv.y));
  vec2 g = fract(cp / 24.0) - 0.5;
  env += uTint * 0.03 * smoothstep(0.11, 0.02, length(g));
  env *= 1.0 - 0.6 * smoothstep(0.05, 0.7, vig);
  vec4 sc = colL(px);
  float solid = nrmL(px).a * (1.0 - smoothstep(0.45, 0.85, sc.a));
  vec3 bg = mix(env, sceneAt(px) * 0.92, solid);

  /* ---- projector: cone of light, ring emitter, light pool */
  if (uCone2.w > 0.001) {
    vec2 A = uCone.xy;
    float hh = (cp.y - A.y) / uCone.w;
    float hw = mix(uCone2.x, uCone.z, clamp(hh, 0.0, 1.0));
    float dx = (cp.x - A.x) / hw;
    float adx = abs(dx);
    float inC = (1.0 - smoothstep(0.55, 1.0, adx)) * smoothstep(0.0, 0.03, hh) * (1.0 - smoothstep(0.7, 1.05, hh));
    float rays = 0.55 + 0.45 * vnoise(vec2(dx * 6.0 + 3.0, hh * 1.2 - uTime * 0.45));
    float rim = smoothstep(0.8, 0.97, adx) * (1.0 - smoothstep(0.97, 1.02, adx)) * smoothstep(0.0, 0.05, hh) * (1.0 - smoothstep(0.4, 1.0, hh));
    float motes = step(0.996, hash12(floor(cp / 3.0) + floor(uTime * 6.0))) * inC;
    float cone = inC * rays * pow(max(1.0 - hh, 0.0), 1.4) * 0.2 + rim * 0.18 + motes * 0.5;
    vec2 de = (cp - A) / uCone2.yz;
    float e = length(de);
    float disc = 1.0 - smoothstep(0.9, 1.0, e);
    float ring = pow(0.5 + 0.5 * cos(6.2832 * (e * 3.0 - uTime * 0.6)), 8.0) * disc * 0.45;
    float edgeR = smoothstep(0.86, 0.95, e) * disc;
    float core = exp(-e * e * 9.0);
    float pool = exp(-length(de * vec2(0.32, 0.3)) * 2.2) * solid;
    vec3 light = uTint * ((cone + ring + edgeR * 0.6 + core * 0.9) * uMisc.x + pool * 0.35);
    bg += light * uCone2.w;
  }

  vec3 col = bg * (1.0 - 0.3 * clamp(I3.y, 0.0, 1.0)) + holo;
  col = 1.0 - exp(-col * 1.2);
  col *= 1.0 - 0.25 * smoothstep(0.2, 0.9, vig);
  return col;
}
`;function d(){let n={mode:`starwars`,from:c.starwars,to:c.starwars,k:1,t:0,stability:.6,nextEvent:2.5,ev:null,roll:0,rollV:0,slice:.5,sliceDir:1,sliceRange:[.12,.88],events:!0,level:0,forced:!1},i={uColA:{value:new r},uColB:{value:new r},uColC:{value:new r},uTint:{value:new r},uScan:{value:new e},uLook:{value:new e},uLook2:{value:new e},uMisc:{value:new e(1,1,0,.5)},uBand:{value:new e(0,0,0,0)},uSig:{value:new t},uCone:{value:new e(0,0,100,100)},uCone2:{value:new e(10,60,16,0)},uSliceX:{value:new t(.1,.9)}},o=(e,t)=>{i.uColA.value.set(...e.colA),i.uColB.value.set(...e.colB),i.uColC.value.set(...e.colC),i.uTint.value.set(...e.tint),i.uScan.value.set(e.scanP,e.scanS,e.scanV,e.sweep),i.uLook.value.set(e.pix,e.chunk,e.noise,e.wire),i.uLook2.value.set(e.dispB,e.dispE,e.jit,e.grid),i.uMisc.value.set(t,e.gain,e.med,n.slice)};return o(c.starwars,1),{frag:u,uniforms:i,normals:!0,background:a.background,holo:n,update(e){n.t+=e,n.k<1&&(n.k=Math.min(1,n.k+e/.7));let t=n.k*n.k*(3-2*n.k),r=n.k>=1?n.to:l(n.from,n.to,t),a=n.stability,s=Math.floor(n.t*(r.pix>1.5?14:22));if(!n.ev&&(n.events||n.forced)&&n.t>n.nextEvent){let e=n.forced?0:Math.random(),t=n.forced?Math.max(1.2,1.35-.85*a):1.35-.85*a;n.forced=!1,n.ev=e<.58?{kind:`band`,t:0,len:.16+Math.random()*.24,amp:t,step:-1}:e<.84?{kind:`drop`,t:0,len:.07+Math.random()*.08,amp:t,step:-1}:{kind:`roll`,t:0,len:.05,amp:t,step:-1},n.ev.kind===`roll`&&(n.roll=(Math.random()<.5?-1:1)*(10+Math.random()*22)*t,n.rollV=0)}let c=1-r.flick*(1.25-.6*a)*(.5+.5*Math.sin(n.t*37)*Math.sin(n.t*11.3));if(i.uBand.value.w=0,n.level=Math.max(0,n.level-e*3),n.ev){let t=n.ev;t.t+=e;let r=Math.floor(t.t/.055);if(t.kind===`band`||t.kind===`drop`){if(r!==t.step){t.step=r;let e=(.04+Math.random()*.14)*(t.kind===`drop`?1.6:1),[a,o]=n.sliceRange,s=a-.05+Math.random()*(o-a+.1)-e/2;i.uBand.value.set(s,s+e,(Math.random()<.5?-1:1)*(16+Math.random()*44)*t.amp,1)}i.uBand.value.w=1,t.kind===`drop`&&(c*=r%2==0?.25+.2*Math.random():.75)}n.level=1,t.t>=t.len&&(n.ev=null,n.nextEvent=n.t+(.9+8.5*a*a+Math.random()*(1.5+3*a)))}n.rollV+=(-900*n.roll-34*n.rollV)*e,n.roll+=n.rollV*e,Math.abs(n.roll)<.05&&Math.abs(n.rollV)<.5&&(n.roll=n.rollV=0);let[u,d]=n.sliceRange;n.slice+=n.sliceDir*e*.16,n.slice>d?(n.slice=d,n.sliceDir=-1):n.slice<u&&(n.slice=u,n.sliceDir=1),o(r,c),i.uSig.value.set(n.roll,s%997)}}}function f(e,t){let n=e.holo;if(!n||n.mode===t)return;let r=n.k*n.k*(3-2*n.k);n.from=n.k>=1?n.to:l(n.from,n.to,r),n.to=c[t],n.k=0,n.mode=t}function p(e,t){let r=e.holo;r&&(r.stability=n.clamp(t,0,1),r.nextEvent=Math.min(r.nextEvent,r.t+.6+6*r.stability))}function m(e){let t=e.holo;t&&!t.ev&&(t.forced=!0,t.nextEvent=t.t)}function h(e,t){let n=e.holo;n&&(n.events=t)}function g(e,t){let n=e.uniforms;n.uCone.value.set(t.x,t.viewH-t.y,t.top,Math.max(1,t.height)),n.uCone2.value.set(t.lens,Math.max(1,t.rx),Math.max(1,t.ry),t.on)}function _(e,t,n,r=.1,i=.9){let a=e.holo;a&&(a.sliceRange=[1-Math.max(t,n),1-Math.min(t,n)],e.uniforms.uSliceX.value.set(r,i))}function v(e){let t=e.holo;return{level:t.level,slice:1-t.slice,mode:t.mode,glitching:!!t.ev}}export{i as a,h as c,_ as d,p as f,a as i,f as l,m as n,s as o,o as r,v as s,d as t,g as u};