import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CX_WDEyT.js";import{t as i}from"./use-spring-BV8nDvvz.js";import{n as a,r as o}from"./index-uImfd-0P.js";import{Ft as s,J as c,Jt as l,Mt as u,N as d,St as f,_n as p,bt as m,gn as h,h as g,qt as _,u as v,vn as y,xt as b}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as x}from"./react-three-fiber.esm-BQtD7wyt.js";import{n as S}from"./iso-C377rVhz.js";import{t as C}from"./Seg-BfWvO_Xs.js";import{t as w}from"./PerformanceMonitor-DPWwL5ZK.js";import{t as T}from"./glsl-CTWV-b_3.js";var E=e(t(),1),D=`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`,O=`
uniform vec2 uRes;
uniform mat3 uCam;
uniform float uFocal;
uniform float uPix;
uniform float uCamY;
uniform float uT;
uniform float uTime;
uniform mat3 uStar;
uniform float uBright, uRays, uHeight, uWave, uGain3;
uniform vec4 uPulse;
uniform vec3 uCore, uFringe, uLow, uGlow;
uniform float uFade;

${T}

float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float h13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vn(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
float vn2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y);
}

/* ------------------------------------------------------------ aurora */

// (zc, plan angle, wave amplitude, base height) of curtain i
vec4 curtain(float i) {
  if (i < 0.5) return vec4(-30.0, 0.26, 5.0, 12.5);
  if (i < 1.5) return vec4(-50.0, -0.16, 12.0, 7.4);
  if (i < 2.5) return vec4(-76.0, 0.34, 13.0, 7.0);
  return vec4(-104.0, -0.26, 14.0, 7.2);
}

float wav(float x, float i, out float d) {
  float w = uT * (0.1 + 0.025 * i);
  float ph = i * 1.93;
  float f1 = 0.05 + 0.008 * i;
  float f2 = 0.13 - 0.01 * i;
  float f3 = 0.31;
  float a1 = x * f1 + w + ph;
  float a2 = x * f2 - w * 1.6 + ph * 2.1;
  float a3 = x * f3 + w * 2.7 + ph * 0.6;
  d = 0.62 * f1 * cos(a1) + 0.3 * f2 * cos(a2) + 0.12 * uWave * f3 * cos(a3);
  return 0.62 * sin(a1) + 0.3 * sin(a2) + 0.12 * uWave * sin(a3);
}

vec3 emit(vec3 q, float u, float i, float base, float fp) {
  float hb = base + 2.2 * sin(u * 0.05 + uT * 0.05 + i * 2.0) + 2.4 * (vn(u * 0.09 - uT * 0.08 + i * 5.0) - 0.5);
  float y = q.y - hb;
  float edge = smoothstep(-0.35 - fp, 0.25 + fp, y);
  float dir = mod(i, 2.0) < 0.5 ? 1.0 : -1.0;
  float sl = uT * (0.45 + 0.2 * i) * dir;
  float r1 = vn(u * 0.9 + sl);
  float r2 = vn(u * 2.9 - sl * 1.7 + 13.0);
  float r3 = vn(u * 8.3 + sl * 2.9 + 31.0);
  float k2 = 1.0 - smoothstep(0.12, 0.4, fp * 2.9);
  float k3 = 1.0 - smoothstep(0.12, 0.4, fp * 8.3);
  float rays = 0.45 * r1 + 0.33 * mix(0.5, r2, k2) + 0.22 * mix(0.5, r3, k3);
  rays = mix(0.5, pow(rays, 1.7) * 1.85, uRays * 0.85);
  rays *= 0.35 + 1.3 * vn(u * 0.21 + sl * 0.3 + 5.0);
  float env = smoothstep(0.22, 0.78, vn(u * 0.028 + uT * 0.04 + i * 7.7));
  float px = (q.x - uPulse.x) / uPulse.y;
  float pulse = uPulse.z * exp(-px * px) + uPulse.w;
  float Hd = (2.4 + 10.0 * rays) * uHeight * (1.0 + 0.5 * pulse);
  float yy = max(y, 0.0);
  float vert = edge * (exp(-yy / Hd) + 0.32 * exp(-yy * 1.6)) * (1.0 - smoothstep(40.0, 78.0, y));
  vec3 col = mix(uCore, uFringe * 0.6, smoothstep(1.5, 2.5 + Hd * 1.0, y));
  col = mix(mix(col, uLow, 0.55), col, smoothstep(-0.5, 0.45 + 0.8 * pulse, y));
  // composition: the show is strongest a little right of north (where the desktop camera puts it)
  float az = atan(q.x, -q.z) - 0.16;
  float comp = 0.1 + 0.9 * exp(-az * az * 6.0);
  return col * vert * (0.03 + 0.97 * env) * comp * (0.15 + rays) * (1.0 + 1.6 * pulse);
}

vec3 aurora(vec3 ro, vec3 rd) {
  vec3 acc = vec3(0.0);
  for (int ci = 0; ci < 4; ci++) {
    float i = float(ci);
    vec4 cp = curtain(i);
    float gain = ci == 3 ? uGain3 : (ci == 0 ? 0.7 : 1.0);
    if (gain < 0.01) continue;
    float ca = cos(cp.y);
    float sa = sin(cp.y);
    // ray in the curtain's plan frame: x' along the curtain, z' across
    vec2 o = vec2(ca * ro.x + sa * ro.z, -sa * ro.x + ca * ro.z);
    vec2 d = vec2(ca * rd.x + sa * rd.z, -sa * rd.x + ca * rd.z);
    if (abs(d.y) < 1e-3) continue;
    float ta = (cp.x + cp.z + 0.6 - o.y) / d.y;
    float tb = (cp.x - cp.z - 0.6 - o.y) / d.y;
    float t0 = max(min(ta, tb), 0.5);
    float t1 = min(max(ta, tb), 320.0);
    if (t1 <= t0) continue;
    float y0 = ro.y + rd.y * t0;
    float y1 = ro.y + rd.y * t1;
    if (max(y0, y1) < cp.w - 2.5 || min(y0, y1) > cp.w + 80.0) continue;
    float dt = (t1 - t0) / 10.0;
    float dd;
    float sPrev = o.y + d.y * t0 - cp.x - cp.z * wav(o.x + d.x * t0, i, dd);
    for (int j = 1; j <= 10; j++) {
      float t = t0 + dt * float(j);
      float x = o.x + d.x * t;
      float s = o.y + d.y * t - cp.x - cp.z * wav(x, i, dd);
      if (s * sPrev <= 0.0) {
        float f = sPrev / (sPrev - s);
        float tq = t - dt + dt * f;
        float xq = o.x + d.x * tq;
        wav(xq, i, dd);
        vec2 n = normalize(vec2(-cp.z * dd, 1.0));
        float cosv = abs(d.x * n.x + d.y * n.y);
        vec3 q = ro + rd * tq;
        acc += emit(q, xq + i * 53.0, i, cp.w, tq * uPix) * (gain * 0.3 / max(cosv, 0.2));
      }
      sPrev = s;
    }
  }
  return acc * uBright;
}

/* ------------------------------------------------------------ sky */

vec3 skyBase(float tanE) {
  float e = max(tanE, 0.0);
  vec3 c = mix(vec3(0.016, 0.03, 0.055), vec3(0.0035, 0.006, 0.016), smoothstep(0.0, 0.7, e));
  c += uGlow * (0.05 * exp(-e * 7.0) + 0.02 * exp(-abs(e - 0.16) * 6.0));
  return c;
}

vec3 stars(vec3 d, float tanE) {
  vec3 sd = uStar * d;
  vec3 col = vec3(0.0);
  // Milky Way: a great-circle band with patchy structure and a dark dust rift
  vec3 MW = normalize(vec3(0.72, 0.52, 0.22));
  float b = dot(sd, MW);
  float band = 0.0;
  if (abs(b) < 0.5) {
    float n = snoise(sd * 2.3) * 0.5 + snoise(sd * 5.1 + 3.0) * 0.3 + snoise(sd * 11.0 + 7.0) * 0.2;
    float dust = smoothstep(0.0, 0.45, snoise(sd * 3.4 + 11.0)) * exp(-b * b * 160.0);
    band = exp(-b * b * 26.0) * smoothstep(-0.35, 0.9, n) * (1.0 - dust * 0.85);
    col += vec3(0.1, 0.095, 0.11) * band + vec3(0.03, 0.045, 0.09) * exp(-b * b * 6.0) * 0.25;
  }
  for (int L = 0; L < 2; L++) {
    float sc = L == 0 ? 95.0 : 230.0;
    vec3 sp = sd * sc;
    vec3 id = floor(sp);
    vec3 f = fract(sp) - 0.5;
    float h = h13(id + float(L) * 17.0);
    float thr = L == 0 ? 0.93 : 0.86 - band * 0.25;
    if (h > thr) {
      vec3 off = (vec3(h13(id + 1.3), h13(id + 2.7), h13(id + 5.1)) - 0.5) * 0.5;
      float dd = length(f - off);
      float cellPx = (1.0 / sc) / uPix;
      float r = max(0.75 / cellPx, 0.05);
      float m = h13(id + 9.1);
      float mag = L == 0 ? 0.35 + 3.0 * m * m * m * m : 0.25 + 0.6 * m * m;
      float tw = 0.6 + 0.4 * sin(uTime * (1.8 + h * 4.0) + h * 91.0);
      tw = mix(1.0, tw, 0.5 + 0.5 * smoothstep(0.4, 0.0, tanE));
      vec3 tint = mix(vec3(1.0, 0.82, 0.66), vec3(0.72, 0.84, 1.0), h13(id + 4.4));
      float fadeL = L == 0 ? 1.0 : smoothstep(1.6, 3.4, cellPx);
      col += tint * exp(-dd * dd / (r * r)) * mag * tw * fadeL * (L == 0 ? 0.9 : 0.35) / max(r * cellPx, 0.75);
    }
  }
  return col * smoothstep(-0.01, 0.12, tanE);
}

/* ------------------------------------------------------------ mountains */

float ridged(float x) {
  float f = 0.0;
  float a = 0.5;
  for (int o = 0; o < 5; o++) {
    float n = 1.0 - abs(2.0 * vn(x) - 1.0);
    f += a * n * n;
    x = x * 2.07 + 1.3;
    a *= 0.5;
  }
  return f;
}
float layerD(float k, float a) {
  if (k < 0.5) return 15.0 + 3.0 * sin(a * 3.1 + 0.7) + 1.5 * sin(a * 7.3);
  if (k < 1.5) return 30.0;
  if (k < 2.5) return 52.0;
  return 90.0;
}
float layerH(float k, float a) {
  if (k < 0.5) {
    float side = smoothstep(0.1, 0.7, abs(a + 0.06));
    return 0.6 + 0.22 * ridged(a * 9.0) + side * (0.5 + 1.3 * ridged(a * 5.0 + 3.0));
  }
  if (k < 1.5) return 0.9 + 3.6 * ridged(a * 3.4 + 7.0) + 3.0 * exp(-abs(a + 0.5) / 0.08);
  if (k < 2.5) return 2.0 + 8.0 * ridged(a * 2.6 + 21.0) + 7.0 * exp(-abs(a - 0.2) / 0.07);
  return 3.0 + 10.0 * ridged(a * 1.6 + 40.0);
}

// pine silhouettes standing on the shore hills (elevation-space test, no geometry)
float pines(float a, float tanE, float ridgeE, float D) {
  float w = 0.009;
  float cell = floor(a / w);
  float hit = 0.0;
  for (int c = -1; c <= 1; c++) {
    float id = cell + float(c);
    float hs = h11(id * 7.13);
    float present = step(0.3, hs) * step(0.22, abs(a + 0.06));
    float cx = (id + 0.5 + (h11(id * 3.7) - 0.5) * 0.6) * w;
    float th = (0.35 + 0.6 * h11(id * 9.1)) / D;
    float yn = (tanE - ridgeE + 0.15 / D) / th;
    float hw = th * 0.34 * (1.0 - yn) * (0.72 + 0.28 * fract(yn * 4.5 + h11(id)));
    hit = max(hit, present * step(0.0, yn) * step(yn, 1.0) * step(abs(a - cx), hw));
  }
  return hit;
}

vec3 world(vec3 d, float camY) {
  float hl = length(d.xz);
  float tanE = d.y / hl;
  float a = atan(d.x, -d.z);
  vec3 sky = skyBase(tanE);

  float hitK = -1.0;
  float D = 0.0;
  float H = 0.0;
  float tree = 0.0;
  for (int k = 0; k < 4; k++) {
    float kf = float(k);
    float Dk = layerD(kf, a);
    float shoreE = -camY / Dk;
    if (tanE < shoreE) continue;
    float Hk = layerH(kf, a);
    float ridgeE = (Hk - camY) / Dk;
    if (tanE < ridgeE) { hitK = kf; D = Dk; H = Hk; break; }
    if (k == 0) {
      float p = pines(a, tanE, ridgeE, Dk);
      if (p > 0.5) { hitK = 0.0; D = Dk; H = Hk; tree = 1.0; break; }
    }
  }

  if (hitK >= 0.0) {
    float hAbs = tanE * D + camY;
    float q = max(H - hAbs, 0.0);
    vec3 rock = vec3(0.004, 0.006, 0.011);
    float g = vn2(vec2(a * D * 2.0, hAbs * 0.45)) * 0.55 + vn2(vec2(a * D * 5.5, hAbs * 1.1)) * 0.45;
    float snow = smoothstep(0.47, 0.55, g + 0.2 - q * (0.05 - hitK * 0.008) + hitK * 0.05);
    if (hitK < 0.5) snow = 0.75 + 0.25 * vn(a * D * 0.6);
    float rim = exp(-q * (1.7 - hitK * 0.35));
    float face = vn(a * D * 0.32 + hitK * 5.0);
    vec3 snowCol = vec3(0.026, 0.034, 0.058) * (0.6 + 0.8 * face) + uGlow * (0.04 + 0.45 * rim + 0.12 * face);
    vec3 c = mix(rock, snowCol, snow * (hitK < 0.5 ? 0.55 : 0.95));
    // a pale line of snow along each shoreline
    c += (vec3(0.012, 0.016, 0.026) + uGlow * 0.06) * exp(-hAbs * 7.0);
    if (tree > 0.5) c = vec3(0.003, 0.004, 0.007) + uGlow * 0.006;
    c = mix(c, skyBase(0.03), 1.0 - exp(-D * 0.01));
    return c;
  }
  vec3 ro = vec3(0.0, camY, 0.0);
  return sky + stars(d, tanE) + aurora(ro, d);
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

float vorEdge(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + h22(n + g) - f;
      float dd = dot(r, r);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) { d2 = dd; }
    }
  }
  return sqrt(d2) - sqrt(d1);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  vec3 rd = normalize(uCam * vec3(uv, -uFocal));
  float camY = uCamY;
  vec3 dir = rd;
  float y = camY;

  float hl = length(rd.xz);
  float tanE = rd.y / hl;
  float a = atan(rd.x, -rd.z);
  bool lake = tanE < -camY / layerD(0.0, a);

  vec3 ice = vec3(0.0);
  float refl = 1.0;
  float crack = 0.0;
  if (lake) {
    float tw = camY / -rd.y;
    vec2 P = rd.xz * tw;
    float fp = tw * uPix / max(-rd.y, 0.03);
    // slightly uneven ice: low-frequency tilt + warp
    vec2 wp = P + vec2(vn2(P * 0.7), vn2(P * 0.7 + 9.0)) * 0.9;
    float n1 = vn2(P * 0.45 + 3.0);
    float n2 = vn2(P * 0.45 + 17.0);
    vec3 N = normalize(vec3((n1 - 0.5) * 0.035, 1.0, (n2 - 0.5) * 0.035));
    dir = reflect(rd, N);
    dir.y = max(dir.y, 0.002);
    y = -camY;
    // cracks: warped voronoi edges, AA'd by the pixel footprint and faded with distance
    float e = vorEdge(wp * 0.42);
    float e2 = vorEdge(wp * 1.3 + 5.0);
    float cw = 0.012 + fp * 0.42;
    crack = (1.0 - smoothstep(0.0, cw, e)) * min(1.0, 0.024 / cw) * (0.4 + 0.6 * vn2(P * 0.8 + 2.0));
    float cw2 = 0.015 + fp * 1.3;
    crack += 0.5 * (1.0 - smoothstep(0.0, cw2, e2)) * min(1.0, 0.03 / cw2);
    // frost: wind-blown patches, denser near the camera and along cracks
    float fr = vn2(P * vec2(0.35, 0.9)) * 0.6 + vn2(P * 1.7 + 4.0) * 0.4;
    float frost = smoothstep(0.5, 0.85, fr + 0.25 * smoothstep(9.0, 2.0, tw)) + crack * 0.3;
    frost = clamp(frost, 0.0, 1.0);
    float F = 0.04 + 0.96 * pow(1.0 - clamp(-rd.y, 0.0, 1.0), 5.0);
    refl = mix(0.35, 0.9, F) * (1.0 - frost * 0.6) * (1.0 - crack * 0.4);
    ice = vec3(0.003, 0.005, 0.01) + (vec3(0.018, 0.024, 0.04) + uGlow * 0.25) * frost * 0.6 + (vec3(0.03, 0.04, 0.055) + uGlow * 0.3) * crack;
  }

  vec3 col = world(dir, y);
  if (lake) col = mix(ice, col * 0.92, refl);

  col = aces(col * 1.1);
  col = pow(col, vec3(1.0 / 2.2));
  vec2 sv = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - dot(sv, sv) * 0.45;
  col += (h12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col * uFade, uFade);
}
`,k=n(),A=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,j=typeof window<`u`?Math.min(window.devicePixelRatio||1,2):1,M=Math.max(.75,j*(A?.6:.8)),N=.55,P=[{zh:`平静`,en:`Quiet arc`,speed:.45,bright:1.05,rays:.5,height:.75,wave:.6,gain3:0,every:[13,20],amp:.55},{zh:`活跃`,en:`Active curtains`,speed:1,bright:1.35,rays:.85,height:1,wave:1,gain3:.55,every:[6,10],amp:.9},{zh:`爆发`,en:`Substorm`,speed:2.2,bright:1.9,rays:1,height:1.4,wave:1.5,gain3:1,every:[2.6,4.8],amp:1.4}],F=[{zh:`经典绿`,core:`#2bff8f`,fringe:`#b13dff`,low:`#ff4a9e`,dot:`#5cffb0`,note:`557.7 nm 氧原子绿光，高处转为紫红`},{zh:`罕见红紫`,core:`#ff2a55`,fringe:`#8a3cff`,low:`#ffa0c8`,dot:`#ff5a86`,note:`630 nm 高空氧红光，只在强磁暴时出现`},{zh:`冰蓝`,core:`#2ad8ff`,fringe:`#5a4bff`,low:`#b9f4ff`,dot:`#6fe4ff`,note:`想象中的冷色帘幕，蓝紫色上缘`}],I=e=>{let t=new d(e);return[t.r,t.g,t.b]};function L({live:e,px:t,py:n}){let r=g(e=>e.gl),i=g(e=>e.size),a=(0,E.useMemo)(()=>{let e={uRes:{value:new h(1,1)},uCam:{value:new m},uFocal:{value:2.1},uPix:{value:.002},uCamY:{value:N},uT:{value:S?18:0},uTime:{value:0},uStar:{value:new m},uBright:{value:1},uRays:{value:1},uHeight:{value:1},uWave:{value:1},uGain3:{value:0},uPulse:{value:new y(0,20,0,0)},uCore:{value:new p},uFringe:{value:new p},uLow:{value:new p},uGlow:{value:new p},uFade:{value:0}},t=new l({vertexShader:D,fragmentShader:O,uniforms:e,depthTest:!1,depthWrite:!1}),n=new s(2,2),r=new f(n,t);r.frustumCulled=!1;let i=new _;return i.add(r),{uniforms:e,mat:t,geo:n,scene:i,cam:new u(-1,1,1,-1,0,1),e:new c(0,0,0,`YXZ`),m4:new b,pole:new p(-.25,.62,-.74).normalize(),buf:new h}},[]);(0,E.useEffect)(()=>()=>{a.mat.dispose(),a.geo.dispose()},[a]);let o=(0,E.useRef)({ready:!1,t:S?18:0,time:0,rot:S?.6:0,fade:0});return(0,E.useEffect)(()=>{let e=!0,t=r.getRenderTarget();return r.setRenderTarget(null),r.compileAsync(a.scene,a.cam).catch(()=>{}).then(()=>{e&&(o.current.ready=!0)}),r.setRenderTarget(t),()=>{e=!1}},[a,r]),v((s,c)=>{let l=Math.min(c,1/30),u=o.current,d=e.current,f=a.uniforms;if(!u.ready){r.setRenderTarget(null),r.setClearColor(0,0),r.clear(!0,!0,!1);return}u.fade=S?1:Math.min(1,u.fade+l/.9),u.t+=l*d.speed,u.time+=l,u.rot+=l*d.spin,r.getDrawingBufferSize(a.buf),f.uRes.value.copy(a.buf);let p=i.width<760,m=i.width<i.height,h=m?1.3:2.05,g=S?-.1:p?-.12:.1,_=m?.24:.16;a.e.set(_+n.get()*.035+Math.sin(u.time*.07)*.006,g-t.get()*.07+Math.sin(u.time*.05)*.012,0),a.m4.makeRotationFromEuler(a.e),f.uCam.value.setFromMatrix4(a.m4),f.uFocal.value=h,f.uPix.value=2/(a.buf.y*h),a.m4.makeRotationAxis(a.pole,u.rot),f.uStar.value.setFromMatrix4(a.m4),f.uT.value=u.t,f.uTime.value=u.time,f.uBright.value=d.bright,f.uRays.value=d.rays,f.uHeight.value=d.height,f.uWave.value=d.wave,f.uGain3.value=d.gain3,f.uPulse.value.set(d.pulseX,d.pulseW,d.pulseAmp,d.pulseAll),f.uCore.value.fromArray(d.core),f.uFringe.value.fromArray(d.fringe),f.uLow.value.fromArray(d.low);let v=.085*d.bright*(1+.8*d.pulseAll+.35*d.pulseAmp);f.uGlow.value.set(d.core[0]*v,d.core[1]*v,d.core[2]*v),f.uFade.value=u.fade,r.setRenderTarget(null),r.render(a.scene,a.cam)},1),null}function R(){let[e,t]=(0,E.useState)(1),[n,s]=(0,E.useState)(0),[c,l]=(0,E.useState)(!0),[u,d]=(0,E.useState)(M),f=(0,E.useRef)({...B(P[1]),core:I(F[0].core),fringe:I(F[0].fringe),low:I(F[0].low),pulseX:0,pulseW:24,pulseAmp:S?.25:0,pulseAll:0,spin:.012}),p=i(0,{stiffness:16,damping:11,mass:1.2}),m=i(0,{stiffness:16,damping:11,mass:1.2});(0,E.useEffect)(()=>{let t=B(f.current),n=B(P[e]),i=r(0,1,{duration:2.2,ease:[.45,0,.2,1],onUpdate:e=>{for(let r of z)f.current[r]=t[r]+(n[r]-t[r])*e}});return()=>i.stop()},[e]),(0,E.useEffect)(()=>{let e=f.current,t={core:[...e.core],fringe:[...e.fringe],low:[...e.low]},i=F[n],a={core:I(i.core),fringe:I(i.fringe),low:I(i.low)},o=r(0,1,{duration:1.8,ease:[.45,0,.2,1],onUpdate:n=>{for(let r of[`core`,`fringe`,`low`])for(let i=0;i<3;i++)e[r][i]=t[r][i]+(a[r][i]-t[r][i])*n}});return()=>o.stop()},[n]),(0,E.useEffect)(()=>{let e=r(f.current.spin,c?.012:0,{duration:1.6,ease:`easeInOut`,onUpdate:e=>f.current.spin=e});return()=>e.stop()},[c]);let h=(0,E.useRef)(null),g=(e,t)=>{let n=f.current,i=Math.random()<.5?-1:1;h.current?.stop();let a=n.pulseAmp,o=n.pulseAll;h.current=r(0,1,{duration:4.6,ease:`linear`,onUpdate:r=>{let s=Math.min(1,r/.14),c=s*s*(3-2*s)*(1-r)**1.6;n.pulseX=e+i*46*r,n.pulseW=16+26*r,n.pulseAmp=a*(1-s)+t*1.6*c,n.pulseAll=o*(1-s)+t*.45*c}})};(0,E.useEffect)(()=>()=>h.current?.stop(),[]),(0,E.useEffect)(()=>{if(S)return;let t=0,n=P[e],r=()=>{let e=n.every[0]+Math.random()*(n.every[1]-n.every[0]);t=window.setTimeout(()=>{g(-40+Math.random()*80,n.amp*(.7+Math.random()*.5)),r()},e*1e3)};return r(),()=>window.clearTimeout(t)},[e]);let _=e=>{let t=e.currentTarget.getBoundingClientRect();p.set((e.clientX-t.left)/t.width*2-1),m.set(-((e.clientY-t.top)/t.height*2-1))},v=()=>{p.set(0),m.set(0)},y=t=>{if(t.target.closest(`.dock, .ar-copy`))return;let n=t.currentTarget.getBoundingClientRect(),r=(t.clientX-n.left-n.width/2)/(n.height/2),i=n.width<n.height,a=(S?-.1:n.width<760?-.12:.1)-p.get()*.07,o=Math.atan(r/(i?1.3:2.05))-a;g(Math.tan(o)*50,P[e].amp*1.15+.3)},b=F[n],T=P[e];return(0,k.jsxs)(`div`,{className:`stage ar`,onPointerMove:_,onPointerLeave:v,onPointerDown:y,children:[(0,k.jsx)(`style`,{children:V}),(0,k.jsxs)(x,{dpr:u,gl:{antialias:!1,alpha:!0,powerPreference:`high-performance`},orthographic:!0,camera:{position:[0,0,1]},children:[(0,k.jsx)(w,{onDecline:()=>d(e=>Math.max(.5,e*.8)),flipflops:3}),(0,k.jsx)(L,{live:f,px:p,py:m})]}),(0,k.jsxs)(`div`,{className:`overlay`,children:[(0,k.jsxs)(a.div,{className:`ar-copy soft-text`,initial:{opacity:0,y:12,filter:`blur(6px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},transition:{duration:.9,delay:.3,ease:[.23,1,.32,1]},children:[(0,k.jsxs)(`p`,{className:`ar-kicker`,children:[(0,k.jsx)(`i`,{style:{background:b.dot,boxShadow:`0 0 12px ${b.dot}`}}),(0,k.jsx)(`span`,{children:`RAYMARCHED CURTAINS ·`}),(0,k.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,k.jsx)(a.span,{initial:{opacity:0,y:8},animate:{opacity:1,y:0},exit:{opacity:0,y:-8},transition:{duration:.4,ease:[.23,1,.32,1]},children:T.en},T.en)})]}),(0,k.jsx)(`h1`,{children:`等一场极光`}),(0,k.jsx)(`p`,{className:`ar-sub`,children:`四道光幕在星空里飘荡，冰湖把它们倒映回来。点一下天空，触发一次亚暴增亮。`}),(0,k.jsx)(`p`,{className:`ar-note`,children:(0,k.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,k.jsx)(a.span,{initial:{opacity:0,filter:`blur(4px)`},animate:{opacity:1,filter:`blur(0px)`},exit:{opacity:0,filter:`blur(4px)`},transition:{duration:.45},children:b.note},b.zh)})})]}),(0,k.jsxs)(`div`,{className:`dock`,children:[(0,k.jsx)(C,{items:P.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:t}),(0,k.jsx)(`span`,{className:`dock-sep`}),(0,k.jsx)(C,{items:F.map((e,t)=>({value:t,label:e.zh})),value:n,onChange:s}),(0,k.jsx)(`span`,{className:`dock-sep`}),(0,k.jsx)(`button`,{className:`seg ar-tog`,"aria-pressed":c,onClick:()=>l(e=>!e),children:(0,k.jsxs)(`span`,{children:[(0,k.jsx)(`i`,{}),(0,k.jsxs)(`b`,{children:[(0,k.jsx)(`em`,{children:`星空`}),`旋转`]})]})})]}),(0,k.jsx)(`p`,{className:`hint`,children:`移动指针 · 视线轻移　点击天空 · 亚暴增亮`})]})]})}var z=[`speed`,`bright`,`rays`,`height`,`wave`,`gain3`];function B(e){return{speed:e.speed,bright:e.bright,rays:e.rays,height:e.height,wave:e.wave,gain3:e.gain3}}var V=`
.ar { background: radial-gradient(120% 80% at 60% 20%, #0a1626 0%, #050b16 55%, #020409 100%); }
.ar-copy {
  --soft-bg: #02050c;
  position: absolute; left: clamp(24px, 6vw, 96px); top: 50%; transform: translateY(-62%);
  max-width: 420px; pointer-events: none !important; isolation: isolate;
}
.ar-copy::before {
  content: ''; position: absolute; z-index: -1; left: -140px; right: -150px; top: -100px; bottom: -90px;
  background: radial-gradient(closest-side, rgba(2, 5, 12, .5), rgba(2, 5, 12, .22) 55%, transparent);
  pointer-events: none;
}
.ar-kicker {
  display: flex; align-items: center; gap: 8px; margin: 0 0 16px;
  font: 500 12px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2);
}
.ar-kicker i { width: 6px; height: 6px; border-radius: 50%; transition: background 1.6s, box-shadow 1.6s; }
.ar-kicker span { display: inline-block; }
.ar-copy h1 { margin: 0; font: 600 clamp(32px, 3.8vw, 52px)/1.08 var(--display); letter-spacing: -.035em; }
.ar-sub { margin: 14px 0 0; font-size: 14.5px; line-height: 1.75; color: var(--fg-2); }
.ar-note { margin: 16px 0 0; min-height: 18px; font: 500 11.5px/1.5 var(--mono); letter-spacing: .03em; color: var(--fg-2); opacity: .8 }
.ar-note span { display: inline-block }
.ar-tog span { display: inline-flex; align-items: center; gap: 7px; }
.ar-tog b { font-weight: inherit; }
.ar-tog em { font-style: normal; }
.ar-tog i { width: 7px; height: 7px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px currentColor; transition: background .25s, box-shadow .25s; }
.ar-tog[aria-pressed='true'] i { background: #9fffd2; box-shadow: 0 0 8px #5cffb0; }
@media (max-width: 760px) {
  .ar .dock .seg { padding: 0 7px; font-size: 12px; }
  .ar .dock .dock-sep { margin: 0 1px; }
  .ar-tog em { display: none; }
  .ar-copy { top: auto; bottom: 92px; right: 24px; transform: none; }
  .ar-copy h1 { font-size: 30px; }
  .ar-sub { font-size: 13px; }
  .ar-note { display: none }
}
`;export{R as default};