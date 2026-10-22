import{B as e,nt as t,vn as n,yn as r}from"./events-9ce18a08.esm-BJiOHOtz.js";var i=[{id:`green`,label:`绿色荧光`},{id:`white`,label:`白色矢量`},{id:`color`,label:`彩色矢量`}],a={title:`街机矢量屏`,en:`Vector Arcade`,background:`#000000`,theme:`dark`},o={green:{beam:[.3,1,.42],phos:[.22,1,.4],screen:[.008,.02,.013],hue:0},white:{beam:[.8,.87,1],phos:[.5,.72,1],screen:[.012,.014,.018],hue:0},color:{beam:[.32,.62,1],phos:[1,1,1],screen:[.01,.01,.018],hue:1}},s=i.map(e=>e.id),c=`
uniform vec3 uBeam;     // beam colour (mode blend)
uniform float uHueW;    // 0 = single beam colour, 1 = per-object hue
uniform vec3 uPhos;     // afterglow tint (per decay step)
uniform vec3 uScreen;   // unlit faceplate
uniform float uLineR;   // edge ring radius, CSS px
uniform float uCrease;  // normal crease threshold (1 - dot)
uniform float uCurve;   // barrel curvature
uniform float uGlow;
uniform float uDecay;   // history multiplier this frame (0 = no persistence)
uniform sampler2D tHist;
uniform float uT;

vec4 nL(vec2 p) { return textureLod(tNormal, p / uRes, 0.0); }
vec4 sL(vec2 p) { return textureLod(tScene, p / uRes, 0.0); }
vec3 srgbOf(vec3 c) {
  c *= uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float zL(vec2 p) {
  float d = textureLod(tDepth, p / uRes, 0.0).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
// alpha 0.5 in the scene target = a surface the beam draws directly (vectorBeam)
float marked(float a) { return 1.0 - smoothstep(0.12, 0.3, abs(a - 0.5)); }
// saturated hue + how coloured the source was
vec4 hueOf(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / (mx + 0.02);
  vec3 h = (c - mn) / max(mx - mn, 1e-3);
  h = pow(h, vec3(1.4));
  return vec4(h, smoothstep(0.12, 0.35, sat));
}
vec3 beamCol(vec4 hs) {
  vec3 h = hs.rgb * 0.85 + 0.15;
  h *= 0.7 / max(luma(h), 0.3); // even out perceived brightness (pure blue would read far dimmer than yellow)
  h = mix(uBeam, h, hs.a);
  return mix(uBeam, h, uHueW);
}
float gram(vec4 a, vec4 b) { float ab = dot(a, b); return dot(a, a) * dot(b, b) - ab * ab; }
vec4 cls(vec4 n) { return vec4((n.rgb * 2.0 - 1.0) * n.a, (1.0 - n.a) * 1.2); }

vec3 stylize(vec2 px) {
  vec2 uv = px / uRes;
  /* ---- tube geometry: barrel distortion + rounded mask */
  vec2 c = uv * 2.0 - 1.0;
  float asp = uRes.x / uRes.y;
  vec2 cn = c * vec2(asp, 1.0) / sqrt(asp * asp + 1.0);
  float r2 = dot(cn, cn);
  vec2 w = c * (1.0 + uCurve * r2);
  vec2 half_ = uRes * 0.5 / uDpr;
  vec2 q = (abs(w) - 1.0) * half_ + 26.0;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 26.0;
  float mask = 1.0 - smoothstep(-2.0, 0.6, sd);
  float edge = 1.0 - smoothstep(-90.0, 0.0, sd);
  vec2 p = (w * 0.5 + 0.5) * uRes;
  p.x += sin(uT * 47.0 + p.y * 0.031) * 0.12 * uDpr; // beam wobble

  /* ---- edges: 8 tap pairs around the centre */
  vec4 nC = nL(p);
  float zC = zL(p);
  vec4 sC = sL(p);
  vec3 nnC = normalize(nC.rgb * 2.0 - 1.0);
  float r = uLineR * uDpr;
  float outer = 0.0, inner = 0.0, lineW = 0.0;
  vec4 lineHue = vec4(0.0);
  for (int i = 0; i < 8; i++) {
    float k = float(i);
    float ring = i < 4 ? 1.0 : 0.5;
    float a = k * 0.785398 + (i < 4 ? 0.0 : 0.3927);
    vec2 d = vec2(cos(a), sin(a)) * r * ring;
    vec2 pa = p + d, pb = p - d;
    vec4 nA = nL(pa), nB = nL(pb);
    float zA = zL(pa), zB = zL(pb);
    float covAll = nA.a * nB.a * nC.a;
    float eCov = max(abs(nA.a - nC.a), abs(nB.a - nC.a));
    float iz = (1.0 / zA + 1.0 / zB - 2.0 / zC) * zC;
    // depth-buffer precision falls with distance: raise the bar so far grazing planes don't trace bands
    float zt = 0.004 + zC * zC * 6e-6;
    vec4 sA = sL(pa), sB = sL(pb);
    // beam-drawn surfaces (marked) never trace their own depth: a huge grazing ground plane shows banding there
    float selfZ = marked(sA.a) * marked(sB.a) * marked(sC.a);
    float eZ = covAll * (1.0 - selfZ) * smoothstep(zt, zt * 1.8 + 0.008, abs(iz) / ring);
    vec3 nnA = normalize(nA.rgb * 2.0 - 1.0), nnB = normalize(nB.rgb * 2.0 - 1.0);
    float dn = max(1.0 - dot(nnA, nnC), 1.0 - dot(nnB, nnC));
    float eN = covAll * smoothstep(uCrease, uCrease * 2.0 + 0.04, dn);
    float e = max(eCov, max(eZ, eN));
    // the front-most of the three gives the line its colour
    float zF = mix(1e9, zC, nC.a);
    vec3 cF = sC.rgb;
    float wa = step(zA, zF - 1e-4) * nA.a;
    cF = mix(cF, sA.rgb, wa); zF = mix(zF, zA, wa);
    float wb = step(zB, zF - 1e-4) * nB.a;
    cF = mix(cF, sB.rgb, wb);
    lineHue += e * hueOf(srgbOf(cF));
    lineW += e;
    if (i < 4) outer += e; else inner += e;
  }
  outer *= 0.25;
  inner *= 0.25;
  float frac = outer * 0.55 + inner * 0.45;
  float line = smoothstep(0.12, 0.6, frac);
  float core = smoothstep(0.55, 0.95, inner) * smoothstep(0.35, 0.8, outer);

  // surfaces the beam draws itself (marked material): their bright texels are lines
  float mC = marked(sC.a);
  vec3 sCs = srgbOf(sC.rgb);
  float bm = mC * luma(sCs);
  float bLine = clamp(bm * 1.8, 0.0, 1.0);
  float bCore = smoothstep(0.45, 0.95, bm);

  /* ---- beam dwell: three or more normal classes on a small ring = a vertex / crossing */
  vec4 v[8];
  vec4 mean = vec4(0.0);
  float R0 = 2.5 * uDpr;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.2;
    v[i] = cls(nL(p + vec2(cos(a), sin(a)) * R0));
    mean += v[i];
  }
  mean *= 0.125;
  for (int i = 0; i < 8; i++) v[i] -= mean;
  float g = gram(v[0], v[2]) + gram(v[1], v[3]) + gram(v[2], v[4]) + gram(v[3], v[5])
          + gram(v[4], v[6]) + gram(v[5], v[7]) + gram(v[6], v[0]) + gram(v[7], v[1]);
  float dwell = smoothstep(0.004, 0.05, g);

  /* ---- phosphor bloom: tap pairs on a spiral, "beam within R" */
  vec4 glowHue = vec4(0.0);
  float glow = 0.0, glowE = 0.0;
  float ign = fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
  for (int i = 0; i < 10; i++) {
    float k = float(i);
    float R = 2.5 * pow(1.29, k) * (0.88 + 0.24 * ign) * uDpr;
    float a = k * 2.39996 + 0.4 + (ign - 0.5) * 0.6;
    vec2 d = vec2(cos(a), sin(a)) * R;
    vec4 nA = nL(p + d), nB = nL(p - d);
    vec4 sA = sL(p + d), sB = sL(p - d);
    float eCov = abs(nA.a - nB.a);
    float eN = i < 4 ? nA.a * nB.a * smoothstep(0.3, 0.7, 1.0 - dot(normalize(nA.rgb * 2.0 - 1.0), normalize(nB.rgb * 2.0 - 1.0))) : 0.0;
    vec3 cA = srgbOf(sA.rgb), cB = srgbOf(sB.rgb);
    float bA = marked(sA.a) * luma(cA), bB = marked(sB.a) * luma(cB);
    float e = max(eCov, eN) + (bA + bB) * 0.35;
    float front = nA.a > nB.a + 0.5 ? 1.0 : nB.a > nA.a + 0.5 ? 0.0 : step(luma(cB), luma(cA));
    float ww = pow(0.86, k);
    glowHue += e * ww * hueOf(mix(cB, cA, front));
    glowE += e * ww;
    glow += e * ww;
  }
  glow /= 5.6;

  vec3 lc = beamCol(lineHue / max(lineW, 1e-3));
  vec3 bc = beamCol(hueOf(sCs));
  vec3 gc = beamCol(glowHue / max(glowE, 1e-3));

  /* ---- emission */
  float bright = 0.72 + 1.1 * dwell;
  vec3 E = lc * line * bright;
  E += mix(vec3(1.0), lc, 0.22) * core * (0.55 + 0.7 * dwell);
  E += lc * dwell * line * 0.9;                       // hot vertex dot
  E += bc * bLine * 0.85 + mix(vec3(1.0), bc, 0.3) * bCore * 0.5;
  E += gc * glow * uGlow * 0.55;
  E *= 0.97 + 0.03 * hash12(vec2(floor(uT * 60.0), 3.1)); // refresh flicker
  vec3 ph = 1.0 - exp(-E * 1.35);

  /* ---- glass (deterministic per pixel, so the afterglow can subtract it back out) */
  vec3 glass = uScreen * (1.0 - r2 * 0.55) * mask;
  vec2 sh = (uv - vec2(0.24, 0.8)) * vec2(asp, 1.0);
  glass += vec3(0.6, 0.7, 0.75) * exp(-dot(sh, sh) * 9.0) * 0.035 * mask;
  glass += vec3(0.5, 0.6, 0.65) * exp(-pow((uv.y - 0.93 + 0.05 * c.x * c.x) * 40.0, 2.0)) * 0.025 * mask;
  float inner_ = mask * (1.0 - edge * 0.55);

  vec3 cur = ph * inner_;
  if (uDecay > 0.0) {
    // the old frame spreads a little every frame, so trails melt into soft streaks instead of crisp copies
    vec2 hp = 1.0 / uRes;
    vec3 h = textureLod(tHist, uv, 0.0).rgb * 0.4
           + (textureLod(tHist, uv + vec2(hp.x, 0.0), 0.0).rgb + textureLod(tHist, uv - vec2(hp.x, 0.0), 0.0).rgb
            + textureLod(tHist, uv + vec2(0.0, hp.y), 0.0).rgb + textureLod(tHist, uv - vec2(0.0, hp.y), 0.0).rgb) * 0.15;
    vec3 prev = max(h - glass, 0.0);
    cur = max(cur, prev * uDecay * uPhos - 1.5 / 255.0);
  }
  vec3 col = cur + glass;
  col += (hash12(px + fract(uT * 3.7) * 61.0) - 0.5) * 0.008 * mask;
  return col;
}
`;function l(t={}){let i=t.mode??`green`,l=s.map(e=>+(e===i)),u={mode:i,w:[...l],target:[...l],t:0,persist:t.persistence??.08,hist:null,captured:0,buf:new n},d=new e(new Uint8Array([0,0,0,255]),1,1);d.needsUpdate=!0;let f={uBeam:{value:new r},uHueW:{value:0},uPhos:{value:new r},uScreen:{value:new r},uLineR:{value:1},uCrease:{value:.12},uCurve:{value:.07},uGlow:{value:1},uDecay:{value:0},tHist:{value:d},uT:{value:0}},p=()=>{let e=[0,0,0],t=[0,0,0],n=[0,0,0],r=0;s.forEach((i,a)=>{let s=o[i];for(let r=0;r<3;r++)e[r]+=s.beam[r]*u.w[a],t[r]+=s.phos[r]*u.w[a],n[r]+=s.screen[r]*u.w[a];r+=s.hue*u.w[a]}),f.uBeam.value.set(e[0],e[1],e[2]),f.uPhos.value.set(t[0],t[1],t[2]),f.uScreen.value.set(n[0],n[1],n[2]),f.uHueW.value=r};return p(),{frag:c,uniforms:f,normals:!0,background:a.background,vec:u,update(e){u.t+=e;let t=Math.min(1,e*4);for(let e=0;e<u.w.length;e++)u.w[e]+=(u.target[e]-u.w[e])*t;p(),f.uT.value=u.t;let n=u.hist&&u.captured>1&&u.persist>.001;if(f.uDecay.value=n&&e>0?Math.exp(-e/u.persist):0,n){let t=Math.min(e,.1);f.uPhos.value.set(f.uPhos.value.x**+t,f.uPhos.value.y**+t,f.uPhos.value.z**+t)}}}}function u(e,t){let n=e.vec;n&&n.mode!==t&&(n.mode=t,n.target=s.map(e=>+(e===t)))}function d(e,t){let n=e.vec;n&&(n.persist=t)}function f(e,n){let r=e.vec;if(!r)return;let i=e.uniforms;n.getDrawingBufferSize(r.buf);let a=Math.max(1,Math.floor(r.buf.x)),o=Math.max(1,Math.floor(r.buf.y));(!r.hist||r.hist.image.width!==a||r.hist.image.height!==o)&&(r.hist?.dispose(),r.hist=new t(a,o),r.captured=0,i.tHist.value=r.hist),n.setRenderTarget(null),n.copyFramebufferToTexture(r.hist),r.captured++}function p(e){let t=e.vec;t?.hist&&(t.hist.dispose(),t.hist=null,t.captured=0)}function m(e){return e.blending=0,e.transparent=!1,e.opacity=.5,e.needsUpdate=!0,e}export{d as a,i as c,u as i,l as n,m as o,p as r,a as s,f as t};