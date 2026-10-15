import{Bt as e,_n as t,gn as n,kt as r,pn as i,vn as a,z as o}from"./events-9ce18a08.esm-BkDjjFw8.js";var s=[{id:`lightbox`,label:`灯箱`,en:`Lightbox`,dark:!0},{id:`chinese`,label:`中国剪纸`,en:`Chinese paper-cut`},{id:`kirigami`,label:`纸雕`,en:`Paper sculpture`}],c={title:`剪纸叠层`,en:`Paper Cut`,background:`#f4ede2`,theme:`light`},l={lightbox:[`#0b2431`,`#0f4251`,`#156a6c`,`#3f9583`,`#e39a52`,`#f0823a`,`#f7a94e`,`#fcd98f`],chinese:[`#f2e3c4`,`#c8161f`,`#c8161f`,`#c8161f`,`#c8161f`,`#c8161f`,`#c8161f`,`#a90f18`],kirigami:[`#e2dfd9`,`#e8e5e0`,`#edebe6`,`#f1efeb`,`#f4f3ef`,`#f7f6f3`,`#f9f8f6`,`#fcfbf9`]},u={lightbox:{A:[7.5,.62,.28,0],B:[1,1,0,.55],C:[.03,.08,.12,0],D:[1,.86,.62,0]},chinese:{A:[3.2,.42,.12,1],B:[1.2,0,1,.12],C:[.35,.12,.08,0],D:[1,.62,.55,0]},kirigami:{A:[9,.5,.38,0],B:[.9,0,0,.22],C:[.2,.22,.3,0],D:[1,1,1,0]}},d=[`lightbox`,`chinese`,`kirigami`],f={lightbox:0,chinese:1,kirigami:2},p=e=>{let t=parseInt(e.slice(1),16);return[t>>16&255,t>>8&255,t&255]},m=`
// papers as an 8×3 RGBA8 texture: row m = mode, back → front
uniform sampler2D tPal;
uniform int uNS;     // shadow taps (as a uniform: keeps ANGLE/FXC from unrolling the loop)
// parameters of the incoming (T) and outgoing (F) mode:
//  A shadow length per layer (CSS px), shadow strength, edge light, flat single sheet (剪纸)
//  B fibre texture, backlight glow, cut patterns, vignette
//  C shadow tint (rgb)
//  D edge light colour (rgb)
uniform vec4 uTA; uniform vec4 uTB; uniform vec4 uTC; uniform vec4 uTD;
uniform vec4 uFA; uniform vec4 uFB; uniform vec4 uFC; uniform vec4 uFD;
uniform float uFrom;
uniform float uTo;
uniform float uMix;
uniform float uLayers;
uniform vec2 uLight;      // unit direction toward the light (screen, y up)
uniform vec2 uGlow;       // lightbox glow centre (uv)
uniform float uDepthMix;
uniform vec2 uDepthRange; // view depth that maps to the front / back of the stack
uniform vec4 uBox;        // shadow box: centre x, centre y (CSS px from the top left), half width, half height
uniform float uBoxOn;
uniform vec3 uPage;
uniform vec3 uFrame;

vec4 PA; vec4 PB; vec4 PC; vec4 PD;
float ROW;
float N;

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 hash22(vec2 p) { return vec2(hash12(p), hash12(p + vec2(37.1, 11.7))); }

vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float depthL(vec2 px) {
  float d = textureLod(tDepth, px / uRes, 0.0).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

// continuous stack height at a (warped) device px: 0 background, 1 … N on the subject
float heightAt(vec2 px) {
  vec3 c = sceneL(px);
  float cov = textureLod(tNormal, px / uRes, 0.0).a;
  float v = luma(c);
  if (uDepthMix > 0.001) {
    float nr = clamp((uDepthRange.y - depthL(px)) / max(uDepthRange.y - uDepthRange.x, 1e-3), 0.0, 1.0);
    v = mix(v, nr, uDepthMix);
  }
  return smoothstep(0.2, 0.8, cov) * (1.0 + clamp(v, 0.0, 1.0) * (N - 1.002));
}

// hand-cut wobble, CSS px
vec2 warpAt(vec2 cp) {
  vec2 w = (vec2(vnoise(cp / 46.0), vnoise(cp / 46.0 + 17.3)) - 0.5) * 7.0;
  w += (vec2(vnoise(cp / 6.5 + 3.1), vnoise(cp / 6.5 + 9.7)) - 0.5) * 1.3;
  vec2 ci = floor(cp / 13.0);
  if (hash12(ci + 2.2) < 0.16) {                     // scissor nick
    vec2 f = fract(cp / 13.0) - 0.5;
    w += (hash22(ci) - 0.5) * 5.0 * max(0.0, 1.0 - length(f) * 4.0);
  }
  return w;
}

// 剪纸 cut patterns, growing with the level t (0..1) so brighter areas show more of the cream ground:
// staggered rows of crescents (月牙纹) on even levels, round holes (圆点) on odd ones.
// Returns the signed distance to the hole (CSS px, < 0 inside) and the paper's outward normal there.
float holes(vec2 cp, float t, float odd, out vec2 nrm) {
  float S = mix(14.0, 19.0, t);
  vec2 g = cp / S;
  float row = floor(g.y);
  g.x += mod(row, 2.0) * 0.5;
  vec2 f = (fract(g) - 0.5) * S;
  if (odd > 0.5) {
    float r = mix(2.0, 3.6, t);
    nrm = -normalize(f + 1e-4);
    return length(f) - r;
  }
  float flip = mod(row, 2.0) < 0.5 ? 1.0 : -1.0;
  float r = mix(3.4, 5.8, t);
  vec2 c2 = vec2(0.0, r * 0.62 * flip);
  float d1 = length(f) - r;
  float d2 = length(f - c2) - r * 0.95;
  nrm = d1 > -d2 ? -normalize(f + 1e-4) : normalize(f - c2 + 1e-4);
  return max(d1, -d2);
}

float patT(float k) { return clamp((k - 2.0) / max(N - 4.0, 1.0), 0.0, 1.0); }

// stack height seen by the shadow rays (剪纸: one flat sheet with its holes)
float occH(vec2 q) {
  vec2 qc = q / uDpr;
  float h = heightAt(q + warpAt(qc) * uDpr);
  if (PA.w > 0.5) {
    float s = smoothstep(0.8, 1.2, h);
    float kq = floor(h);
    if (PB.z > 0.5 && kq > N - 1.5 && N > 2.5) s = 0.0;   // the cut-away top level (its rim is ignored)
    else if (PB.z > 0.5 && kq >= 2.0) {
      vec2 hn;
      s *= smoothstep(-0.7, 0.7, holes(qc, patT(kq), mod(kq, 2.0), hn));
    }
    return s;
  }
  return h;
}

// each sheet takes the nearest card of the mode's 8 (no in-between mixes: teal + orange would go muddy)
vec3 paper(float k) {
  float u = clamp(k / max(N - 1.0, 1.0), 0.0, 1.0);
  return texelFetch(tPal, ivec2(int(floor(u * 7.0 + 0.5)), int(ROW)), 0).rgb;
}

float fibres(vec2 cp, float seed) {
  float n = (vnoise(cp * 0.9 + seed) - 0.5) * 0.5 + (vnoise(cp * 0.22 + seed * 2.0) - 0.5) * 0.7;
  vec2 q = cp * 0.4 + seed * 3.0;
  vec2 r1 = mat2(0.8, 0.6, -0.6, 0.8) * q;
  vec2 r2 = mat2(0.28, -0.96, 0.96, 0.28) * q;
  float f = smoothstep(0.66, 0.92, vnoise(vec2(r1.x * 0.22, r1.y * 3.0)))
          + smoothstep(0.68, 0.93, vnoise(vec2(r2.x * 0.25, r2.y * 3.2)));
  return n * 0.06 + f * 0.035;
}

float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 papercut(vec2 px, float frontD) {
  vec2 cp = px / uDpr;
  vec2 pw = px + warpAt(cp) * uDpr;
  float r = 1.6 * uDpr;
  float hc = heightAt(pw);
  float hx1 = heightAt(pw + vec2(r, 0.0)), hx0 = heightAt(pw - vec2(r, 0.0));
  float hy1 = heightAt(pw + vec2(0.0, r)), hy0 = heightAt(pw - vec2(0.0, r));
  float H = (2.0 * hc + hx1 + hx0 + hy1 + hy0) / 6.0;
  vec2 grad = vec2(hx1 - hx0, hy1 - hy0) / (2.0 * r);
  float gl = max(length(grad), 1e-4);
  float k = clamp(floor(H), 0.0, N - 1.0);
  float dLow = k < 0.5 ? 1e4 : (H - k) / gl;      // to this sheet's own cut edge
  float dUp = k > N - 1.5 ? 1e4 : (k + 1.0 - H) / gl; // to the edge of the sheet above
  vec2 eN = -grad / gl;                           // outward normal of this sheet's edge
  float kLow = k - 1.0, kUp = k + 1.0;

  // 剪纸: one red sheet (阴阳刻). Shapes are separated by thin cut lines; the darkest level stays solid,
  // the middle levels are decorated with crescents / dots cut through to the cream ground, and the
  // brightest level is cut away entirely, leaving only a red outline rim. cutA = how much of this pixel
  // is cut away (shows the ground).
  float flatS = PA.w;
  float cutA = 0.0;
  if (PB.z > 0.5 && k >= 2.0) {
    float gap = 1.15 * uDpr;
    cutA = 1.0 - smoothstep(gap - 0.6 * uDpr, gap + 0.6 * uDpr, dLow);
    bool top = k > N - 1.5 && N > 2.5;
    // erosion probe: is this pixel more than E inside its own level?
    float E = (top ? 4.4 : 5.5) * uDpr;
    float m = 1e3;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982;
      m = min(m, heightAt(pw + vec2(cos(a), sin(a)) * E) - k);
    }
    float inner = smoothstep(-0.1, 0.1, m);
    if (top) {
      cutA = max(cutA, inner);
    } else {
      vec2 hn;
      float hs = holes(cp, patT(k), mod(k, 2.0), hn) * uDpr;
      cutA = max(cutA, inner * (1.0 - smoothstep(-0.7 * uDpr, 0.7 * uDpr, hs)));
    }
    dLow = 1e4;   // edges between red levels are drawn by cutA
  }
  if (flatS > 0.5 && k >= 1.0) dUp = 1e4;
  float own = flatS > 0.5 ? 0.0 : k;   // 剪纸: shadows are only computed for the ground

  // drop shadow from the sheets above (toward the light), plus contact shadow at the foot of each step
  float h = PA.x * uDpr;
  float sh = 0.0;
  for (int i = 0; i < uNS; i++) {
    float x = 0.45 + float(i) * 0.62;
    float hq = occH(px + uLight * h * x);
    float need = own + (flatS > 0.5 ? 0.5 : max(x, 0.9));
    float w = 0.18 + 0.16 * x;
    sh = max(sh, smoothstep(need - w, need + w, hq) * (1.0 - 0.13 * x));
  }
  float ao = 1.0 - smoothstep(0.0, h * 0.8, dUp);
  float shade = max(sh, ao * 0.55) * PA.y;
  float groundShade = shade;
  if (flatS > 0.5 && k >= 1.0) shade = 0.0;   // the red sheet itself is flat

  vec2 uv = px / uRes;
  vec3 col = paper(k);
  col *= 1.0 + fibres(cp, k * 7.3) * PB.x;
  // lightbox: light shining through the sheets from behind — translucent paper glows in its own colour,
  // the back sheets most, with a small warm core at the lamp
  if (PB.y > 0.01) {
    vec2 gd = (uv - uGlow) * vec2(uRes.x / uRes.y, 1.0);
    float g = exp(-dot(gd, gd) * 3.2);
    float back = 1.0 - k / max(N - 1.0, 1.0);
    col = min(col * (1.0 + PB.y * g * (0.15 + 1.7 * back * back * back)), vec3(1.0));
    col += vec3(1.0, 0.78, 0.45) * PB.y * exp(-dot(gd, gd) * 26.0) * 0.35 * back;
  }
  col *= 1.0 - shade * (vec3(1.0) - PC.rgb);
  // the cut edge: a thin lit rim where it faces the light, darker where it faces away
  float e = 1.0 - smoothstep(0.0, 1.6 * uDpr, dLow);
  float facing = dot(eN, uLight);
  col += PD.rgb * e * PA.z * (0.25 + 0.75 * max(facing, 0.0));
  col *= 1.0 - e * 0.22 * max(-facing, 0.0);

  // antialias across the nearest cut
  float aa = 0.9 * uDpr;
  if (dLow < dUp) {
    if (dLow < aa) {
      vec3 nb = paper(kLow) * (1.0 - PA.y * 0.6 * (vec3(1.0) - PC.rgb));
      col = mix(nb, col, 0.5 + 0.5 * dLow / aa);
    }
  } else if (dUp < aa) {
    vec3 nb = paper(kUp) + PD.rgb * PA.z * 0.5;
    col = mix(nb, col, 0.5 + 0.5 * dUp / aa);
  }

  // 剪纸: the cut-away parts show the (shadowed) cream ground
  if (cutA > 0.0) {
    vec3 gcol = paper(0.0) * (1.0 + fibres(cp, 0.0) * PB.x) * (1.0 - groundShade * (vec3(1.0) - PC.rgb));
    col = mix(col, gcol, cutA);
  }

  // scissor cut sweeping across on a mode change
  col *= 1.0 - 0.55 * (1.0 - smoothstep(0.6 * uDpr, 1.6 * uDpr, frontD));
  col *= 1.0 - 0.2 * (1.0 - smoothstep(0.0, 10.0 * uDpr, frontD - 1.0 * uDpr)) * step(0.0, frontD);
  return col;
}

vec3 stylize(vec2 px) {
  bool to = true;
  float frontD = 1e5;
  if (uMix < 1.0) {
    // sweep across the box when there is one, else across the screen
    float span = uBoxOn > 0.5 ? 2.0 * uBox.z * uDpr : uRes.x;
    float x0 = uBoxOn > 0.5 ? (uBox.x - uBox.z) * uDpr : 0.0;
    float wc = (px.x - x0) / span * 0.84 + (1.0 - px.y / uRes.y) * 0.16 + (vnoise(px / uDpr * 0.01) - 0.5) * 0.03;
    float f = wc - (uMix * 1.24 - 0.12);
    to = f <= 0.0;
    frontD = abs(f) * span / 0.84;
  }
  PA = to ? uTA : uFA;
  PB = to ? uTB : uFB;
  PC = to ? uTC : uFC;
  PD = to ? uTD : uFD;
  ROW = to ? uTo : uFrom;
  N = max(uLayers, 2.0);

  vec2 uv = px / uRes;
  if (uBoxOn < 0.5) {
    vec3 c = papercut(px, frontD);
    vec2 vq = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    return c * (1.0 - PB.w * 0.5 * smoothstep(0.3, 1.1, length(vq)));
  }

  // shadow box on a paper wall
  vec2 tl = vec2(px.x, uRes.y - px.y) / uDpr;
  vec2 Lt = vec2(uLight.x, -uLight.y);
  vec2 p = tl - uBox.xy;
  float sd = sdBox(p, uBox.zw, 10.0);
  float fw = clamp(min(uBox.z, uBox.w) * 0.07, 12.0, 22.0);
  vec3 col = vec3(0.0);
  if (sd < 1.0) {
    col = papercut(px, frontD);
    // the frame shades the inside of the box along the edges that face away from the light
    float fs = smoothstep(-4.0, 14.0, sdBox(p + Lt * 22.0, uBox.zw, 10.0));
    col *= 1.0 - 0.5 * fs - 0.12 * (1.0 - smoothstep(0.0, 26.0, -sd));
    vec2 vq = p / uBox.zw;
    col *= 1.0 - PB.w * 0.32 * smoothstep(0.45, 1.25, length(vq));
  }
  if (sd > -1.0) {
    vec3 o;
    if (sd < fw) {
      // painted wooden frame, lip on the inside, lit from the light side
      float t = sd / fw;
      vec2 gn = normalize(vec2(
        sdBox(p + vec2(1.0, 0.0), uBox.zw, 10.0) - sdBox(p - vec2(1.0, 0.0), uBox.zw, 10.0),
        sdBox(p + vec2(0.0, 1.0), uBox.zw, 10.0) - sdBox(p - vec2(0.0, 1.0), uBox.zw, 10.0)) + 1e-5);
      float lit = dot(gn, -Lt);
      o = uFrame * (0.94 + 0.05 * vnoise(tl * vec2(0.6, 0.08)));
      o *= 1.0 + 0.1 * lit * (1.0 - smoothstep(0.0, 0.3, t)) - 0.05;
      o *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.12, t));
      o *= 1.0 - 0.1 * smoothstep(0.85, 1.0, t);
    } else {
      // the wall, with the box's soft shadow
      o = uPage * (1.0 + fibres(tl, 91.0) * 0.8);
      float ds = sdBox(p + Lt * 18.0, uBox.zw + fw, 10.0);
      o *= 1.0 - 0.2 * (1.0 - smoothstep(-12.0, 34.0, ds));
    }
    col = sd <= -1.0 ? col : (sd >= 1.0 ? o : mix(col, o, smoothstep(-1.0, 1.0, sd)));
  }
  return col;
}
`,h=new WeakMap,g=e=>e.uniforms?h.get(e.uniforms):void 0;function _(s={}){let g=s.mode??`lightbox`,_=s.layers??5,v=new Uint8Array(96);d.forEach((e,t)=>l[e].forEach((e,n)=>v.set([...p(e),255],(t*8+n)*4)));let y=new o(v,8,3,e,i);y.minFilter=y.magFilter=r,y.needsUpdate=!0;let b=()=>new a,x=e=>new t(...p(e).map(e=>e/255)),S={tPal:{value:y},uNS:{value:5},uTA:{value:b()},uTB:{value:b()},uTC:{value:b()},uTD:{value:b()},uFA:{value:b()},uFB:{value:b()},uFC:{value:b()},uFD:{value:b()},uFrom:{value:f[g]},uTo:{value:f[g]},uMix:{value:1},uLayers:{value:_},uLight:{value:new n(-.6,.8)},uGlow:{value:new n(.5,.62)},uDepthMix:{value:0},uDepthRange:{value:new n(1,20)},uBox:{value:new a(0,0,1,1)},uBoxOn:{value:0},uPage:{value:x(`#efe7da`)},uFrame:{value:x(`#f8f5ef`)}},C={mode:g,layers:_,layersT:_,t:0,box:null,sweep:!0};h.set(S,C);let w=(e,t)=>{let n=u[d[t]];S[e+`A`].value.fromArray(n.A),S[e+`B`].value.fromArray(n.B),S[e+`C`].value.fromArray(n.C),S[e+`D`].value.fromArray(n.D)},T=()=>{w(`uT`,S.uTo.value),w(`uF`,S.uFrom.value)};return T(),{frag:m,uniforms:S,normals:!0,background:c.background,update(e,t){let n=S;C.t+=e,n.uMix.value<1&&(n.uMix.value=Math.min(1,n.uMix.value+e/1.3),n.uMix.value>=1&&(n.uFrom.value=n.uTo.value)),C.layers+=(C.layersT-C.layers)*(1-Math.exp(-e*3.2)),Math.abs(C.layers-C.layersT)<.002&&(C.layers=C.layersT),n.uLayers.value=C.layers,T();let r=C.t,i=C.sweep?2.25+Math.sin(r*.21)*.5:2.25;n.uLight.value.set(Math.cos(i),Math.sin(i));let a=.56,o=.6;if(C.box){let e=t.width/t.dpr,n=t.height/t.dpr;a=C.box.x/e+C.box.halfWidth/e*.25,o=1-(C.box.y-C.box.halfHeight*.25)/n}n.uGlow.value.set(a+Math.sin(r*.17)*.06,o+Math.sin(r*.23+1)*.04)}}}function v(e,t){let n=g(e),r=e.uniforms;n&&n.mode!==t&&(n.mode=t,r.uMix.value>=.5&&(r.uFrom.value=r.uTo.value),r.uTo.value=f[t],r.uMix.value=0)}function y(e,t){let n=g(e);n&&(n.layersT=t)}function b(e,t,n=1,r=20){let i=e.uniforms;i.uDepthMix.value=t,i.uDepthRange.value.set(n,r)}function x(e,t){let n=g(e),r=e.uniforms;n&&(n.box=t,r.uBoxOn.value=+!!t,t&&r.uBox.value.set(t.x,t.y,t.halfWidth,t.halfHeight))}export{x as a,v as c,s as i,_ as n,b as o,c as r,y as s,l as t};