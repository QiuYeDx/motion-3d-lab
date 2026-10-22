import{P as e,bn as t,gt as n,vn as r}from"./events-9ce18a08.esm-BJiOHOtz.js";var i=[{id:`amber`,label:`琥珀`,en:`Amber day`},{id:`night`,label:`夜蓝`,en:`Blue night`},{id:`rose`,label:`玫瑰`,en:`Rose`}],a={title:`剪影动画`,en:`Silhouette Film`,background:`#d8b27a`,theme:`dark`},o=new e(-10,-10,1),s={amber:{top:`#4a2108`,hor:`#f0ae55`,glow:`#fff1c4`,ink:`#140904`,sky:[.36,.64,.5,.5],night:[0,0,.74,.76]},night:{top:`#030a1f`,hor:`#2f6493`,glow:`#cfe8f6`,ink:`#02040b`,sky:[.36,.73,.74,.36],night:[1,1,.73,.76]},rose:{top:`#3a0820`,hor:`#ee93a3`,glow:`#ffe6d6`,ink:`#130309`,sky:[.36,.38,.52,.55],night:[.15,0,.74,.76]}},c=`
#define PI 3.14159265
#define TAU 6.28318531
uniform vec3 uTop;
uniform vec3 uHor;
uniform vec3 uGlowC;
uniform vec3 uInk;
uniform vec4 uSky;     // horizon y, glow x, glow y, glow size
uniform vec4 uNight;   // stars, moon, moon x, moon y
uniform vec4 uFilm;    // amount, flicker gain, frame number, splice flash
uniform vec2 uWeave;   // gate weave, CSS px
uniform vec4 uHaze;    // near depth, far depth, levels, max haze
uniform vec4 uLace;    // ornament scale, fringe, holes, gauze pan
uniform vec4 uScrX;    // 4 scratches: x (uv)
uniform vec4 uScrK;    // 4 scratches: strength (+ light, − dark)
uniform float uDunes;
uniform int uLat;      // lattice half-size (uniform → loop stays rolled)

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}

float rawDepth(vec2 p) { return textureLod(tDepth, p / uRes, 0.0).r; }
float covOf(float d) { return d < 0.99999 ? 1.0 : 0.0; }
// anti-aliased coverage: the scene is cleared to a negative key (r = g = −10) in the float target, so the
// resolved MSAA colour at an edge is α·object + (1 − α)·key → α ≈ (m + 10) / 10.4
float covAt(vec2 p) {
  vec3 c = textureLod(tScene, p / uRes, 0.0).rgb;
  return clamp((0.5 * (c.r + c.g) + 10.0) / 10.4, 0.0, 1.0);
}
float linD(float d) {
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
float hazeOf(float dl, vec2 cp) {
  // the edge between two paper layers is torn, not ruled
  float tear = (vnoise(cp * vec2(0.035, 0.05)) - 0.5) * 0.35 + (vnoise(cp * 0.21) - 0.5) * 0.08;
  float h = clamp((dl - uHaze.x) / max(uHaze.y - uHaze.x, 1e-3), 0.0, 1.0) * uHaze.z + tear;
  h = clamp(h, 0.0, uHaze.z);
  float f = floor(h);
  h = f + smoothstep(0.48, 0.52, h - f);
  return pow(h / uHaze.z, 0.7) * uHaze.w;
}

// ornament family by the paper's original hue: 0 leaves · 1 lace · 2 curls · 3 tassels · 4 plain (near-black
// paper keeps a clean outline — figures)
float motifOf(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float ch = mx - mn;
  if (mx < 0.07) return 4.0;
  if (ch < 0.14 * mx + 0.03) return 0.0;
  float h;
  if (mx == c.r) h = mod((c.g - c.b) / ch, 6.0);
  else if (mx == c.g) h = (c.b - c.r) / ch + 2.0;
  else h = (c.r - c.g) / ch + 4.0;
  h /= 6.0;
  if (h < 0.105 || h > 0.9) return 1.0;
  if (h < 0.19) return 3.0;
  if (h < 0.5) return 0.0;
  return 2.0;
}

vec3 skyAt(vec2 uv, vec2 cp) {
  float asp = uRes.x / uRes.y;
  float above = uv.y - uSky.x;
  float t = clamp(above / max(1.0 - uSky.x, 0.05), 0.0, 1.0);
  vec3 c = mix(uHor, uTop, pow(t, 0.75));
  c = mix(c, uHor * 0.72, smoothstep(0.0, -0.45, above));    // below the horizon: the lower paper is denser
  vec2 g = (uv - uSky.yz) * vec2(asp, 1.0);
  float gl = exp(-dot(g, g) / (uSky.w * uSky.w));
  c = mix(c, uGlowC, gl * 0.8);
  // two gauze layers drifting at their own depth: overlapping translucent paper is a little denser (darker)
  float pan = uLace.w;
  vec2 q1 = vec2(cp.x * 0.0022 + pan * 0.05 + uTime * 0.004, cp.y * 0.006);
  float g1 = smoothstep(0.52, 0.6, fbm(q1) + (uv.y - 0.62) * 0.35);
  vec2 q2 = vec2(cp.x * 0.0034 + pan * 0.11 - uTime * 0.006, cp.y * 0.0085 + 3.0);
  float g2 = smoothstep(0.55, 0.62, fbm(q2) + (0.5 - abs(uv.y - 0.55)) * 0.3 - 0.12);
  c *= 1.0 - 0.1 * g1 - 0.08 * g2;
  c += uGlowC * 0.05 * (g1 - g2) * gl;
  // paper fibres
  float fib = vnoise(cp * vec2(0.6, 0.05)) * 0.5 + vnoise(cp * vec2(0.07, 0.55) + 9.0) * 0.5;
  c *= 0.965 + 0.06 * fib;
  // stars + moon
  if (uNight.x > 0.001) {
    vec2 sc = cp / 15.0;
    vec2 si = floor(sc);
    float h = hash12(si + 7.7);
    vec2 sp = (si + 0.2 + 0.6 * vec2(hash12(si + 1.3), hash12(si + 4.1))) * 15.0;
    float r = mix(0.5, 1.4, pow(hash12(si + 2.9), 3.0));
    float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
    float st = step(0.9, h) * (1.0 - smoothstep(r * 0.5, r + 0.6, length(cp - sp))) * tw;
    st *= smoothstep(0.02, 0.2, above);
    c = mix(c, uGlowC * 1.15, st * uNight.x);
  }
  if (uNight.y > 0.001) {
    vec2 m = (uv - uNight.zw) * vec2(asp, 1.0) * uRes.y / uDpr;   // CSS px from the moon centre
    float R = 30.0;
    float disc = 1.0 - smoothstep(R - 0.8, R + 0.8, length(m));
    float bite = 1.0 - smoothstep(R - 0.8, R + 0.8, length(m - vec2(13.0, 9.0)));
    float halo = exp(-max(length(m) - R, 0.0) / 46.0) * 0.32;
    c = mix(c, uGlowC, halo * uNight.y);
    c = mix(c, uGlowC * 1.18, disc * (1.0 - bite) * uNight.y);
  }
  // far dunes on the lowest paper layer
  if (uDunes > 0.001) {
    float x = cp.x * 0.004 + pan * 0.03;
    float top = uSky.x - 0.035 + 0.03 * sin(x * 2.1) + 0.018 * sin(x * 5.3 + 1.0) + 0.006 * sin(x * 17.0);
    float dn = smoothstep(0.6, -0.6, (uv.y - top) * uRes.y);
    c = mix(c, mix(uInk, c, 0.62), dn * uDunes);
  }
  return c;
}

vec3 paperOf(vec3 sky, float hz) { return mix(uInk, sky * 0.9, hz); }

vec3 stylize(vec2 px) {
  float S = uDpr;
  vec2 p = px + uWeave * S;                // gate weave moves the whole picture
  vec2 uv = p / uRes;
  vec2 cp = p / S;
  vec3 sky = skyAt(uv, cp);

  float d0 = rawDepth(p);
  float covA = smoothstep(0.15, 0.85, covAt(p));
  float cov0 = step(0.5, covA) * covOf(d0);
  float dl0 = linD(d0);
  float hz0 = hazeOf(dl0, cp);

  // ring → signed distance to the outline (device px, + inside) and outward normal
  float sc = uLace.x * S;
  float R = 12.5 * sc;                    // > the longest ornament, so tips stay inside the ring's reach
  float f = 0.0;
  vec2 g = vec2(0.0);
  for (int k = 0; k < 16; k++) {
    float a = float(k) * TAU / 16.0 + 0.13;
    vec2 dir = vec2(cos(a), sin(a));
    float c = covAt(p + dir * R);
    f += c;
    g += dir * c;
  }
  f /= 16.0;
  float d = -R * cos(PI * f);
  vec2 n = dot(g, g) > 1e-6 ? -normalize(g) : vec2(0.0, 1.0);
  vec2 t = vec2(-n.y, n.x);
  bool edge = f > 0.001 && f < 0.999;
  if (edge) {
    // the ring estimate is a staircase (16 taps, each with a 1 px ramp): refine it. Bisect for the 0.5
    // crossing along the normal through the pixel, then through two points ±T along the outline → an exact
    // foot point and an exact tangent
    vec2 c0 = p + n * d;
    vec2 c1 = c0;
    vec2 c2 = c0;
    float T = 4.0 * sc;
    for (int k = 0; k < 3; k++) {
      vec2 base = k == 0 ? p : c0 + t * (k == 1 ? -T : T);
      float lo = k == 0 ? -R : -R * 0.5;
      float hi = -lo;
      float cl = covAt(base + n * lo);
      float ch = covAt(base + n * hi);
      for (int it = 0; it < 7; it++) {
        float mid = 0.5 * (lo + hi);
        float cm = covAt(base + n * mid);
        if (cm > 0.5) { lo = mid; cl = cm; } else { hi = mid; ch = cm; }
      }
      float sx = lo + clamp((cl - 0.5) / max(cl - ch, 1e-4), 0.0, 1.0) * (hi - lo);
      vec2 cx = base + n * sx;
      if (k == 0) c0 = cx;
      else if (k == 1) c1 = cx;
      else c2 = cx;
    }
    vec2 tg = c2 - c1;
    if (dot(tg, tg) > 1.0 && abs(dot(normalize(tg), t)) > 0.7) {
      t = normalize(tg) * sign(dot(tg, t));
      n = vec2(t.y, -t.x);
    }
    d = dot(0.5 * (c1 + c2) - p, n) * 0.5 + dot(c0 - p, n) * 0.5;
  }

  float fringe = 0.0;
  float hole = 0.0;
  float hzIn = hz0;
  if (edge) {
    // the paper this outline belongs to: a point 4 px inside it
    vec2 pin = p + n * (d - 4.0 * sc);
    float dIn = rawDepth(pin);
    // (if the probe misses the paper — thin parts, gaps — the edge stays plain rather than guessing)
    float m = covAt(pin) > 0.9 ? motifOf(linearToSrgb(textureLod(tScene, pin / uRes, 0.0).rgb)) : 4.0;
    hzIn = covOf(dIn) > 0.5 ? hazeOf(linD(dIn), cp) : hz0;
    if (cov0 > 0.5) hzIn = hz0;

    float s = 5.6 * sc;                   // lattice step
    vec2 a1 = vec2(s, 0.0);
    vec2 a2 = vec2(0.5 * s, 0.8660254 * s);
    // seeds that can reach this pixel sit along the outline next to its foot point, not round the pixel
    vec2 foot = p + n * (d - 2.0 * sc);
    float jy = floor(foot.y / a2.y + 0.5);
    float jx = floor((foot.x - jy * a2.x) / s + 0.5);
    float band = 0.433 * s;
    float holeD = 4.4 * sc;               // eyelet row depth under the outline
    float aa = 0.6;
    for (int j = -uLat; j <= uLat; j++) {
      for (int i = -uLat; i <= uLat; i++) {
        vec2 id = vec2(jx + float(i), jy + float(j));
        vec2 q = id.x * a1 + id.y * a2;
        float dq = d - dot(q - p, n);
        float h = hash12(id * 1.37 + 11.0);
        // a · fringe ornaments on the outline
        // seeds near the edge of the band fade out instead of popping (the estimate is never exact)
        float wf = 1.0 - smoothstep(0.22 * s, 0.5 * s, abs(dq));
        if (wf > 0.0 && uLace.y > 0.001 && m < 3.5) {
          vec2 b = q + n * dq;
          vec2 r = (p - b) / mix(0.35, 1.0, wf);
          float u = dot(r, t);
          float v = dot(r, n);
          float sd = 99.0;
          if (m < 0.5) {
            // leaf / feather: pointed, bent to one side, on a short stalk
            float L = s * (1.15 + 0.55 * h);
            float vv = v / L;
            float bend = (h > 0.5 ? 1.0 : -1.0) * (0.22 + 0.3 * fract(h * 7.0));
            float uu = u - bend * L * vv * vv;
            float w = s * 0.3 * pow(max(sin(PI * clamp(vv * 0.9 + 0.08, 0.0, 1.0)), 0.0), 0.9);
            w = max(w, 0.6 * S * step(-1.0, vv) * step(vv, 0.3));
            sd = max(abs(uu) - w, max(-v - 2.5 * S, v - L));
            // a vein cut down the middle of the bigger leaves
            sd = max(sd, mix(-99.0, 0.38 * S - abs(uu), step(0.28, vv) * step(vv, 0.78) * step(0.55, h)));
          } else if (m < 1.5) {
            // scallop with an eyelet: lace
            float rr = s * 0.66;
            float l = length(r - n * rr * 0.32);
            sd = max(l - rr, -(l - rr * 0.36));
          } else if (m < 2.5) {
            // open curl: a ring standing on the outline, open on one side
            float rc = s * (0.55 + 0.25 * h);
            float sg = h > 0.5 ? 1.0 : -1.0;
            vec2 cc = n * (rc + 0.2 * S) + t * sg * rc * 0.45;
            vec2 rl = r - cc;
            float l = length(rl);
            float ring = abs(l - rc) - 0.62 * S * uLace.x;
            float ang = atan(dot(rl, t) * sg, dot(rl, n));
            ring = max(ring, (0.55 - abs(ang - 1.2)) * l);
            sd = ring;
          } else {
            // tassel: a thin thread with a bead
            float L = s * (1.3 + 0.6 * h);
            float w = mix(0.95, 0.45, clamp(v / L, 0.0, 1.0)) * S * uLace.x;
            float th = max(abs(u) - w, max(-v - 2.5 * S, v - L));
            float bead = length(r - n * (L + 1.1 * S)) - 1.5 * S * uLace.x;
            sd = min(th, bead);
          }
          sd *= mix(0.35, 1.0, wf);
          fringe = max(fringe, (1.0 - smoothstep(-aa, aa, sd)) * uLace.y * step(0.05, wf));
        }
        // b · a row of punched eyelets under the outline
        float wh = 1.0 - smoothstep(0.22 * s, 0.5 * s, abs(dq - holeD));
        if (wh > 0.05 && uLace.z > 0.001) {
          vec2 hc = q + n * (dq - holeD);
          float rh = (m > 0.5 && m < 1.5 ? 1.35 : 1.05) * sc * mix(0.4, 1.0, wh);
          float sd = length(p - hc) - rh;
          hole = max(hole, (1.0 - smoothstep(-aa, aa, sd)) * uLace.z);
        }
      }
    }
    // only where the piece is thick enough to keep a solid rim around the holes
    hole *= smoothstep(holeD - 2.6 * sc, holeD - 1.4 * sc, d);
    // lace gets an inner slit line too
    if (m > 0.5 && m < 1.5) {
      float sl = 1.0 - smoothstep(0.35 * S, 0.9 * S, abs(d - 8.0 * sc));
      hole = max(hole, sl * step(d, R * 0.9) * uLace.z * smoothstep(5.0 * sc, 7.0 * sc, d));
    }
  }

  // overlapping pieces: a slit of light along the nearer piece's edge
  float slit = 0.0;
  float hzBack = hz0;
  if (cov0 > 0.5) {
    float tol = max(dl0 * 0.06, 0.08);
    for (int k = 0; k < 4; k++) {
      vec2 o = (k == 0 ? vec2(1.0, 0.0) : k == 1 ? vec2(-1.0, 0.0) : k == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0)) * 1.3 * S;
      float dk = rawDepth(p + o);
      if (covOf(dk) > 0.5) {
        float lk = linD(dk);
        if (lk - dl0 > tol) {
          slit = 1.0;
          hzBack = hazeOf(lk, cp);
        }
      }
    }
  }

  // compose
  vec3 col = mix(sky, paperOf(sky, cov0 > 0.5 ? hz0 : hzIn), max(covA, fringe));
  col = mix(col, mix(paperOf(sky, hzBack), sky, 0.45), slit * cov0 * 0.6);
  col = mix(col, sky, hole * cov0 * (1.0 - hz0 * 0.5));

  // film: flicker, grain, scratches, dust, gate vignette
  float F = uFilm.x;
  float fr = uFilm.z;
  col *= mix(1.0, uFilm.y, F);
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  vec2 gc = floor(cp / 1.4);
  float gr = hash12(gc + fr * 17.31) + hash12(gc * 1.7 + fr * 5.17) - 1.0;
  col += gr * (0.03 + 0.05 * (1.0 - abs(lum * 2.0 - 1.0))) * F * mix(uHor, vec3(1.0), 0.5);
  for (int k = 0; k < 4; k++) {
    float sx = k == 0 ? uScrX.x : k == 1 ? uScrX.y : k == 2 ? uScrX.z : uScrX.w;
    float sk = k == 0 ? uScrK.x : k == 1 ? uScrK.y : k == 2 ? uScrK.z : uScrK.w;
    float dx = abs(cp.x - sx * uRes.x / S + sin(cp.y * 0.013 + sx * 40.0) * 2.0);
    float ln = (1.0 - smoothstep(0.25, 1.1, dx)) * (0.55 + 0.45 * vnoise(vec2(sx * 99.0, cp.y * 0.05)));
    col += ln * sk * F * (sk > 0.0 ? 0.45 : 0.6) * (sk > 0.0 ? mix(uGlowC, vec3(1.0), 0.4) : col);
  }
  vec2 dc = floor(cp / 70.0);
  float dh = hash12(dc + fr * 3.71);
  if (dh > 0.955) {
    vec2 dp = (dc + 0.15 + 0.7 * vec2(hash12(dc + fr), hash12(dc - fr * 1.3))) * 70.0;
    vec2 dv = cp - dp;
    float rr = mix(0.9, 3.2, hash12(dc * 2.1 + fr));
    float blob = 1.0 - smoothstep(rr * 0.6, rr, length(dv * vec2(1.0, 0.7 + 0.6 * hash12(dc + 5.0))) + (vnoise(dv * 0.9) - 0.5) * rr * 0.8);
    // a hair now and then: a squiggly thread
    float hair = 0.0;
    if (dh > 0.993) {
      float ha = hash12(dc + 2.0) * TAU;
      vec2 hv = vec2(dot(dv, vec2(cos(ha), sin(ha))), dot(dv, vec2(-sin(ha), cos(ha))));
      float len = 12.0 + 16.0 * hash12(dc + 9.0);
      float wig = 3.0 * sin(hv.x * 0.21 + ha * 3.0) + 1.6 * sin(hv.x * 0.53 + 1.0);
      hair = (1.0 - smoothstep(0.25, 0.8, abs(hv.y - wig))) * (1.0 - smoothstep(len * 0.8, len, abs(hv.x)));
    }
    float dk = max(blob, hair * 0.8);
    vec3 dcol = dh > 0.975 ? mix(uGlowC, vec3(1.0), 0.5) * 0.95 : uInk;
    col = mix(col, dcol, dk * F * 0.85);
  }
  vec2 vq = abs(px / uRes - 0.5) * 2.0;
  vq.x *= 1.0 + 0.04 * (uRes.x / uRes.y - 1.0);
  float gate = pow(pow(vq.x, 5.0) + pow(vq.y, 5.0), 0.2);
  float vig = smoothstep(0.62, 1.12, gate);
  col *= 1.0 - (0.42 + 0.28 * F) * vig;
  float rnd = length((px / uRes - 0.5) * vec2(uRes.x / uRes.y, 1.0));
  col *= 1.0 - 0.18 * smoothstep(0.35, 0.95, rnd);
  col += uGlowC * uFilm.w * 0.55;
  return clamp(col, 0.0, 1.0);
}
`,l=new WeakMap,u=e=>e.uniforms?l.get(e.uniforms):void 0,d=(e,t)=>{let r=parseInt(t.slice(1),16);e.setRGB((r>>16&255)/255,(r>>8&255)/255,(r&255)/255,n)},f=new e,p=new e;function m(n={}){let i=n.mode??`amber`,a=s[i],u=t=>{let n=new e;return d(n,t),n},m={uTop:{value:u(a.top)},uHor:{value:u(a.hor)},uGlowC:{value:u(a.glow)},uInk:{value:u(a.ink)},uSky:{value:new t(...a.sky)},uNight:{value:new t(...a.night)},uFilm:{value:new t(n.film??1,1,0,0)},uWeave:{value:new r},uHaze:{value:new t(6.9,10.5,3,.75)},uLace:{value:new t(1.7,1,1,0)},uScrX:{value:new t(.2,.5,.7,.9)},uScrK:{value:new t},uDunes:{value:1},uLat:{value:2}},h={mode:i,from:a,to:a,k:1,film:n.film??1,filmT:n.film??1,t:0,frame:0,frameT:0,wx:0,wy:0,flash:0,scr:Array.from({length:4},()=>({x:Math.random(),k:0,life:0,v:0}))};l.set(m,h);let g=(e,t,n,r)=>{d(f,t),d(p,n),e.value.copy(f).lerp(p,r)},_=(e,t,n,r)=>{e.value.set(t[0]+(n[0]-t[0])*r,t[1]+(n[1]-t[1])*r,t[2]+(n[2]-t[2])*r,t[3]+(n[3]-t[3])*r)};return{frag:c,uniforms:m,background:o,update(e){let t=m;if(h.t+=e,h.k<1){h.k=Math.min(1,h.k+e/1.1);let n=h.k<.5?2*h.k*h.k:1-(-2*h.k+2)**2/2;g(t.uTop,h.from.top,h.to.top,n),g(t.uHor,h.from.hor,h.to.hor,n),g(t.uGlowC,h.from.glow,h.to.glow,n),g(t.uInk,h.from.ink,h.to.ink,n),_(t.uSky,h.from.sky,h.to.sky,n),_(t.uNight,h.from.night,h.to.night,n)}h.film+=(h.filmT-h.film)*(1-Math.exp(-e*6)),h.flash=Math.max(0,h.flash-e*5);let n=t.uFilm.value;if(n.x=h.film,n.w=h.flash,h.frameT+=e,h.frameT>=1/18){h.frameT%=1/18,h.frame=(h.frame+1)%997,h.wx=h.wx*.55+(Math.random()-.5)*1.1,h.wy=h.wy*.55+(Math.random()-.5)*1.6+(Math.random()<.03?(Math.random()-.5)*3:0),n.y=1+(Math.random()-.5)*.09+Math.sin(h.t*2.3)*.02,n.z=h.frame;for(let e of h.scr)e.life<=0?Math.random()<.04&&(e.x=.05+Math.random()*.9,e.life=.6+Math.random()*2.4,e.k=(Math.random()<.7?1:-1)*(.5+Math.random()*.5),e.v=(Math.random()-.5)*.004):(e.life-=1/18,e.x+=e.v+(Math.random()-.5)*.0012);let e=t.uScrX.value,r=t.uScrK.value,i=e=>e.life>0&&Math.random()>.18?e.k:0;e.set(h.scr[0].x,h.scr[1].x,h.scr[2].x,h.scr[3].x),r.set(i(h.scr[0]),i(h.scr[1]),i(h.scr[2]),i(h.scr[3]))}t.uWeave.value.set(h.wx*h.film*.6,h.wy*h.film*.8)}}}function h(e,t){let r=u(e);if(!r||r.mode===t)return;let i=e.uniforms,a=e=>`#`+e.value.getHexString(n),o=e=>e.value.toArray();r.from={top:a(i.uTop),hor:a(i.uHor),glow:a(i.uGlowC),ink:a(i.uInk),sky:o(i.uSky),night:o(i.uNight)},r.to=s[t],r.mode=t,r.k=0,r.flash=1}function g(e,t){let n=u(e);n&&(n.filmT=t)}function _(e,t,n,r=3,i=.8){e.uniforms.uHaze.value.set(t,n,r,i)}function v(e,t=1.7,n=1,r=1){let i=e.uniforms.uLace.value;i.set(t,n,r,i.w)}function y(e,t){let n=e.uniforms;n.uLace.value.w=t}function b(e,t){let n=e.uniforms;n.uDunes.value=t}export{b as a,h as c,_ as i,y as l,a as n,g as o,i as r,v as s,m as t};