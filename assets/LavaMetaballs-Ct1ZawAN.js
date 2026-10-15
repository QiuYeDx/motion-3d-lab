import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CX_WDEyT.js";import{t as i}from"./use-spring-BV8nDvvz.js";import{n as a,r as o}from"./index-uImfd-0P.js";import{At as s,_n as c,gn as l,h as u,u as d,vn as f,yt as p}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as m}from"./react-three-fiber.esm-BQtD7wyt.js";import{n as h}from"./iso-C377rVhz.js";import{t as g}from"./Seg-BfWvO_Xs.js";import{t as _}from"./PerformanceMonitor-DPWwL5ZK.js";import{n as v,r as y}from"./glsl-CTWV-b_3.js";var b=e(t(),1),x=n(),S=e=>({waxA:v(e.waxA),waxB:v(e.waxB),liquid:v(e.liquid),glow:v(e.glow),bg:v(e.bg)}),C=[{key:`lava`,zh:`熔岩`,en:`Molten`,desc:`橙红的蜡在琥珀色的液体里翻涌`,p:{waxA:`#c4231a`,waxB:`#ffb04a`,liquid:`#4a1410`,glow:`#ff6a2c`,bg:`#120a12`}},{key:`mint`,zh:`薄荷`,en:`Mint`,desc:`冷绿的蜡，像一杯会动的薄荷冰`,p:{waxA:`#19b394`,waxB:`#c4fff0`,liquid:`#062b2c`,glow:`#39dcb4`,bg:`#061112`}},{key:`amethyst`,zh:`紫晶`,en:`Amethyst`,desc:`紫色蜡团带着粉色的透光边缘`,p:{waxA:`#7436e6`,waxB:`#ffa3f1`,liquid:`#1c0d38`,glow:`#a86bff`,bg:`#0c0817`}}],w=[`waxA`,`waxB`,`liquid`,`glow`,`bg`],T=-.62,E=.98,D=9,O=1.38,k=new c(0,.22,4.6),A=new c(0,0,0);function j(e){let t=Math.min(Math.max((e-T)/1.6,0),1);return t<.3?.265+.08*Math.sin(t/.3*Math.PI*.5):.345-.17*((t-.3)/.7)**1.1}var M=`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`,N=`
precision highp float;
uniform vec2 uRes;
uniform vec2 uShift;
uniform float uZoom;
uniform float uTime;
uniform vec3 uRo;
uniform vec4 uBlob[${D}];
uniform float uStr[${D}];
uniform float uK;
uniform float uKp;
uniform vec3 uWaxA, uWaxB, uLiquid, uGlow, uBg;

#define Y0 ${T.toFixed(3)}
#define Y1 ${E.toFixed(3)}
#define YB -1.30
#define YT 1.30
#define FOCAL ${O.toFixed(3)}

float glassR(float y) {
  float s = clamp((y - Y0) / (Y1 - Y0), 0.0, 1.0);
  if (s < 0.3) return 0.265 + 0.08 * sin((s / 0.3) * 1.5707963);
  return 0.345 - 0.17 * pow((s - 0.3) / 0.7, 1.1);
}
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float sdEll(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)) + 1e-5; return k0 * (k0 - 1.0) / k1; }

/* ---- lamp body ---- */
float sdGlass(vec3 p, float off) {
  float d = (length(p.xz) - glassR(p.y) - off) * 0.9;
  return max(d, max(Y0 - p.y, p.y - Y1));
}
float sdBase(vec3 p) {
  float t = clamp((p.y - YB) / (Y0 - YB), 0.0, 1.0);
  float rb = 0.272 + 0.2 * pow(1.0 - t, 1.25);
  float d = (length(p.xz) - rb) * 0.82;
  return max(d, max(YB - p.y, p.y - Y0)) - 0.004;
}
float sdCap(vec3 p) {
  float t = clamp((p.y - Y1) / (YT - Y1), 0.0, 1.0);
  float rc = mix(0.19, 0.082, pow(t, 0.9));
  float d = (length(p.xz) - rc) * 0.9;
  return max(d, max(Y1 - p.y, p.y - YT)) - 0.006;
}
float sdCollar(vec3 p, float y, float r) { vec2 q = vec2(length(p.xz) - r, p.y - y); return length(q) - 0.02; }

float mapBody(vec3 p, out float id) {
  float g = sdGlass(p, 0.012);
  float m = min(sdBase(p), sdCap(p));
  m = min(m, sdCollar(p, Y0 + 0.01, glassR(Y0) + 0.012));
  m = min(m, sdCollar(p, Y1 - 0.01, glassR(Y1) + 0.012));
  id = g < m ? 2.0 : 1.0;
  return min(g, m);
}
vec3 nBody(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  float i;
  return normalize(e.xyy * mapBody(p + e.xyy, i) + e.yyx * mapBody(p + e.yyx, i) + e.yxy * mapBody(p + e.yxy, i) + e.xxx * mapBody(p + e.xxx, i));
}

/* ---- wax ---- */
float wax(vec3 p) {
  // a resting pool on the heated bottom and a little cooled cap of wax at the top
  float d = sdEll(p - vec3(0.0, Y0 + 0.015, 0.0), vec3(0.25, 0.11, 0.25));
  d = smin(d, sdEll(p - vec3(0.0, Y1 - 0.01, 0.0), vec3(0.13, 0.045, 0.13)), 0.08);
  for (int i = 0; i < ${D}; i++) {
    vec4 b = uBlob[i];
    float s = uStr[i];
    float sq = inversesqrt(s);
    d = smin(d, sdEll(p - b.xyz, vec3(b.w * sq, b.w * s, b.w * sq)), i == 8 ? uKp : uK);
  }
  // the glass holds it in
  return max(d, sdGlass(p, -0.004));
}
vec3 nWax(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.002;
  return normalize(e.xyy * wax(p + e.xyy) + e.yyx * wax(p + e.yyx) + e.yxy * wax(p + e.yxy) + e.xxx * wax(p + e.xxx));
}

/* ---- room ---- */
float lampGlow() { return 0.92 + 0.08 * sin(uTime * 0.7) * sin(uTime * 1.13); }

vec3 wallCol(vec2 w, float lg) {
  vec2 q = vec2(w.x, w.y - 0.15);
  float d2 = dot(q, q);
  vec3 c = uBg + uGlow * (0.34 * exp(-d2 * 0.55) + 0.12 * exp(-d2 * 0.12)) * lg;
  // soft corner where wall meets table
  return c * (0.75 + 0.25 * smoothstep(YB, YB + 0.9, w.y));
}

vec3 room(vec3 ro, vec3 rd) {
  float lg = lampGlow();
  // floor (table) at the base of the lamp
  if (rd.y < 0.0) {
    float t = (YB - ro.y) / rd.y;
    vec3 p = ro + rd * t;
    if (p.z > -2.2) {
      float r = length(p.xz);
      vec3 f = uBg * 0.85;
      f += uGlow * (0.42 * exp(-r * r * 2.2) + 0.12 * exp(-r * 0.9)) * lg;
      // contact darkening right under the base
      f *= 0.35 + 0.65 * smoothstep(0.42, 0.62, r);
      // glossy streak: a blurry reflection of the lamp toward the camera
      f += uGlow * 0.16 * exp(-p.x * p.x * 30.0) * smoothstep(0.4, 1.8, p.z) * exp(-max(p.z - 1.8, 0.0)) * lg;
      // fade into the dark far away and into the wall's corner tone, so there is no hard horizon
      f = mix(f, uBg * 0.6, smoothstep(2.0, 6.0, length(p.xz)));
      f = mix(f, wallCol(vec2(p.x, YB), lg), smoothstep(-0.4, -2.2, p.z));
      return f;
    }
  }
  // wall
  float t = (-2.2 - ro.z) / rd.z;
  vec3 p = ro + rd * t;
  return wallCol(p.xy, lg);
}

vec3 env(vec3 r) {
  // studio-ish reflection: a soft top softbox, a side strip, the warm glow of the room
  vec3 c = uBg * 1.4;
  c += vec3(0.85, 0.82, 0.8) * smoothstep(0.55, 0.95, r.y) * 0.55;
  c += vec3(0.9) * smoothstep(0.07, 0.0, abs(r.x + 0.62)) * smoothstep(-0.3, 0.4, r.y) * 0.6;
  c += uGlow * 0.45 * exp(-r.y * r.y * 6.0) * smoothstep(0.6, -0.4, r.z);
  return c;
}

/* ---- shading ---- */
vec3 shadeMetal(vec3 p, vec3 n, vec3 rd) {
  vec3 r = reflect(rd, n);
  float fr = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
  vec3 col = env(r) * vec3(0.78, 0.76, 0.74) * (0.55 + 0.45 * fr);
  // satin finish: a broad key-light lobe so the cone reads as turned metal
  vec3 K = normalize(vec3(-0.55, 0.5, 0.65));
  col += vec3(0.2, 0.19, 0.19) * pow(max(dot(n, K), 0.0), 1.5);
  col += vec3(0.5) * pow(max(dot(r, K), 0.0), 24.0);
  // light pouring out of the glass onto the metal next to it
  float nearBase = smoothstep(Y0 - 0.45, Y0, p.y) * step(p.y, Y0 + 0.05);
  float nearCap = smoothstep(Y1 + 0.3, Y1, p.y) * step(Y1 - 0.05, p.y);
  col += uGlow * (nearBase * 0.55 * max(n.y + 0.3, 0.0) + nearCap * 0.4 * max(-n.y + 0.4, 0.0)) * lampGlow();
  return col;
}

vec3 liquidAt(vec3 p) {
  // the liquid is lit from the bulb in the base: brighter low down
  float h = smoothstep(Y1, Y0, p.y);
  return uLiquid * (0.55 + 1.1 * h * h) * lampGlow();
}

vec3 shadeWax(vec3 p, vec3 rd) {
  vec3 n = nWax(p);
  vec3 L = normalize(vec3(0.0, Y0 - 0.25, 0.0) - p);
  float heat = smoothstep(0.85, Y0, p.y);
  float diff = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  // thickness probe along the inward normal: thin lobes and necks let the bulb light through
  float thin = 0.0;
  for (int k = 1; k <= 3; k++) {
    float dk = 0.045 * float(k);
    thin += clamp((wax(p - n * dk) + dk) / dk, 0.0, 1.0);
  }
  thin /= 3.0;
  float ndv = max(dot(n, -rd), 0.0);
  float fr = pow(1.0 - ndv, 3.0);
  float mixT = clamp(heat * 0.3 + thin * 0.5 + fr * 0.2 - 0.12, 0.0, 1.0);
  vec3 col = mix(uWaxA, uWaxB, mixT * mixT);
  col *= 0.34 + 1.0 * diff;
  // subsurface-ish glow: rims and thin necks pass the bulb light, hotter low down
  col += uWaxB * (fr * 0.42 + thin * thin * 0.55 * (0.3 + heat)) * (0.5 + 0.5 * heat);
  // a soft room highlight on top
  vec3 h = normalize(normalize(vec3(-0.45, 0.8, 0.55)) - rd);
  col += pow(max(dot(n, h), 0.0), 40.0) * 0.32;
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv = (uv - uShift) / uZoom;
  vec3 ro = uRo;
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * FOCAL + uv.x * rt + uv.y * up);

  vec3 col = room(ro, rd);

  // bounding cylinder around the whole lamp — most pixels never march
  float a = dot(rd.xz, rd.xz);
  float b = dot(ro.xz, rd.xz);
  float c = dot(ro.xz, ro.xz) - 0.5 * 0.5;
  float disc = b * b - a * c;
  if (disc > 0.0) {
    float t0 = (-b - sqrt(disc)) / a;
    float t1 = (-b + sqrt(disc)) / a;
    float t = max(t0, 0.0);
    float id = 0.0;
    bool hit = false;
    for (int i = 0; i < 64; i++) {
      vec3 p = ro + rd * t;
      if (p.y < YB - 0.05 || p.y > YT + 0.05) { if ((p.y - ro.y) * rd.y > 0.0 && t > t1) break; }
      float d = mapBody(p, id);
      if (d < 0.0008) { hit = true; break; }
      t += d;
      if (t > t1 + 0.05) break;
    }
    if (hit) {
      vec3 p = ro + rd * t;
      vec3 n = nBody(p);
      if (id < 1.5) {
        col = shadeMetal(p, n, rd);
      } else {
        // ---- through the glass into the liquid ----
        vec3 rd2 = refract(rd, n, 1.0 / 1.33);
        vec3 q = p + rd2 * 0.02;
        float tt = 0.0;
        float haze = 0.0;
        bool onWax = false;
        for (int i = 0; i < 52; i++) {
          float g = sdGlass(q, -0.004);
          if (g > 0.003) break;
          float d = wax(q);
          haze += exp(-max(d, 0.0) * 16.0) * 0.035;
          if (d < 0.0015) { onWax = true; break; }
          float st = clamp(d * 0.92, 0.006, 0.12);
          q += rd2 * st;
          tt += st;
        }
        vec3 inside;
        vec3 liq = liquidAt(q);
        if (onWax) {
          inside = shadeWax(q, rd2);
        } else if (q.y < Y0 + 0.03) {
          // looking down into the heated base: the bulb
          inside = mix(uWaxB, vec3(1.0, 0.95, 0.85), 0.3) * 1.15;
        } else if (q.y > Y1 - 0.03) {
          inside = uLiquid * 0.6;
        } else {
          // out through the back wall: the room, tinted by the liquid
          inside = room(q, normalize(mix(rd2, rd, 0.5))) * (uLiquid * 2.2 + 0.25) ;
        }
        float absorb = 1.0 - exp(-tt * 1.4);
        inside = mix(inside, liq, onWax ? absorb * 0.35 : 0.55 + 0.25 * absorb);
        inside += uWaxB * haze * 0.35;
        // glass surface
        float ndv = max(dot(n, -rd), 0.0);
        float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
        vec3 refl = env(reflect(rd, n));
        col = mix(inside, refl, F);
        // crisp softbox strips on the glass
        vec3 nv = n;
        col += vec3(1.0) * smoothstep(0.06, 0.0, abs(nv.x + 0.55)) * smoothstep(0.0, 0.3, nv.z) * 0.45;
        col += vec3(1.0) * smoothstep(0.03, 0.0, abs(nv.x - 0.7)) * 0.25;
      }
    }
  }

  // vignette + tiny dither against banding in the dark gradients
  vec2 sv = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - dot(sv, sv) * 0.55;
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`,P=[{T:21,ph:0,r:.125,ax:.07,az:.05,w:.31,s:.2},{T:26,ph:.37,r:.105,ax:.09,az:.06,w:.23,s:1.7},{T:17,ph:.62,r:.085,ax:.1,az:.07,w:.41,s:3.1},{T:30,ph:.15,r:.145,ax:.05,az:.04,w:.19,s:4.4},{T:23,ph:.81,r:.095,ax:.11,az:.05,w:.27,s:5.3},{T:19,ph:.5,r:.075,ax:.08,az:.08,w:.37,s:6.6},{T:28,ph:.71,r:.11,ax:.07,az:.06,w:.25,s:7.9},{T:24,ph:.26,r:.09,ax:.1,az:.05,w:.33,s:9.2},{T:22,ph:.92,r:.1,ax:.08,az:.05,w:.29,s:10.5}],F=(e,t,n)=>{let r=Math.min(Math.max((n-e)/(t-e),0),1);return r*r*(3-2*r)};function I(e,t,n){let r=(t/e.T+e.ph)%1,i=-.56+F(.06,.94,1-Math.abs(2*r-1))*1.38,a=e.ax*Math.sin(t*e.w+e.s)+.04*Math.sin(t*e.w*2.3+e.s*2.1),o=e.az*Math.cos(t*e.w*.8+e.s*1.3),s=e.r*(1+.1*Math.sin(t*.9+e.s)+(r<.5?.08:-.06));n.set(a,i,o,s)}function L(e){let t=Math.max(.02,j(e.y)-e.w*.55),n=Math.hypot(e.x,e.z);n>t&&(e.x*=t/n,e.z*=t/n)}function R({pal:e,ptr:t}){let n=u(e=>e.size),r=u(e=>e.gl),a=(0,b.useMemo)(()=>({uRes:{value:new l},uShift:{value:new l},uZoom:{value:1},uTime:{value:0},uRo:{value:k.clone()},uBlob:{value:Array.from({length:D},()=>new f)},uStr:{value:Array(D).fill(1)},uK:{value:.16},uKp:{value:.22},uWaxA:{value:new c},uWaxB:{value:new c},uLiquid:{value:new c},uGlow:{value:new c},uBg:{value:new c}}),[]),o=y(()=>({vertexShader:M,fragmentShader:N,uniforms:a,depthTest:!1,depthWrite:!1})),m=i(0,{stiffness:26,damping:9,mass:1}),g=i(-.5,{stiffness:26,damping:9,mass:1}),_=i(0,{stiffness:26,damping:9,mass:1}),v=(0,b.useMemo)(()=>({v:new f,prevY:new Float32Array(D),t:0,ray:new c,fw:new c,rt:new c,up:new c,cam:k.clone(),sway:new l,pull:0}),[]);return d((i,o)=>{let c=Math.min(o,1/30);v.t+=c;let l=v.t+(h?9:0),u=a;r.getDrawingBufferSize(u.uRes.value);let d=n.width/n.height,f=n.width<760;h?(u.uShift.value.set(0,0),u.uZoom.value=.9):f?(u.uShift.value.set(0,.17),u.uZoom.value=Math.min(.62,d*1.35)):(u.uShift.value.set(Math.min(.15*d,.3),-.01),u.uZoom.value=.88);let y=t.current,b=performance.now()-y.t<2600&&!h;v.sway.x=p.damp(v.sway.x,b?y.x*.35:Math.sin(l*.12)*.25,1.6,c),v.sway.y=p.damp(v.sway.y,b?y.y*.15:0,1.6,c),v.cam.set(k.x+v.sway.x,k.y+v.sway.y,k.z),u.uRo.value.copy(v.cam);let x=v.v;if(b){let e=(y.x*.5*d-u.uShift.value.x)/u.uZoom.value,t=(y.y*.5-u.uShift.value.y)/u.uZoom.value;v.fw.copy(A).sub(v.cam).normalize(),v.rt.crossVectors(v.fw,s.DEFAULT_UP).normalize(),v.up.crossVectors(v.rt,v.fw),v.ray.copy(v.fw).multiplyScalar(O).addScaledVector(v.rt,e).addScaledVector(v.up,t).normalize();let n=-v.cam.z/v.ray.z,r=v.cam.x+v.ray.x*n,i=p.clamp(v.cam.y+v.ray.y*n,-.5,.88),a=j(i)-.07;m.set(p.clamp(r,-a,a)),g.set(i),_.set(.05)}else I(P[8],l,x),m.set(x.x),g.set(x.y),_.set(x.z);v.pull=p.damp(v.pull,+!!b,3,c);for(let e=0;e<D;e++){let t=u.uBlob.value[e];e===8?t.set(m.get(),g.get(),_.get(),P[e].r*(1+.15*v.pull)):I(P[e],l,t),L(t);let n=(t.y-v.prevY[e])/Math.max(c,.001);v.prevY[e]=t.y;let r=1+Math.min(Math.abs(n)*.9,.45);u.uStr.value[e]=p.damp(u.uStr.value[e],r,4,c)}u.uKp.value=.2+.08*v.pull,u.uTime.value=l;let S=e.current;u.uWaxA.value.fromArray(S.waxA),u.uWaxB.value.fromArray(S.waxB),u.uLiquid.value.fromArray(S.liquid),u.uGlow.value.fromArray(S.glow),u.uBg.value.fromArray(S.bg)}),(0,x.jsx)(`mesh`,{material:o,frustumCulled:!1,children:(0,x.jsx)(`planeGeometry`,{args:[2,2]})})}var z=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,B=typeof window<`u`?Math.min(window.devicePixelRatio||1,2):1,V=z||B>1.3?Math.max(.75,B*.6):1;function H(){let[e,t]=(0,b.useState)(0),[n,i]=(0,b.useState)(V),s=(0,b.useRef)({x:0,y:0,t:-1e9}),c=(0,b.useRef)(S(C[0].p));(0,b.useEffect)(()=>{let t=S(C[0].p);for(let e of w)t[e]=[...c.current[e]];let n=S(C[e].p),i=r(0,1,{duration:1.4,ease:[.45,0,.2,1],onUpdate:e=>{for(let r of w)for(let i=0;i<3;i++)c.current[r][i]=t[r][i]+(n[r][i]-t[r][i])*e}});return()=>i.stop()},[e]);let l=e=>{let t=e.currentTarget.getBoundingClientRect();s.current.x=(e.clientX-t.left)/t.width*2-1,s.current.y=-((e.clientY-t.top)/t.height*2-1),s.current.t=performance.now()},u=C[e];return(0,x.jsxs)(`div`,{className:`stage lv`,style:{background:u.p.bg,transition:`background 1.4s`},onPointerMove:l,onPointerDown:l,children:[(0,x.jsx)(`style`,{children:U}),(0,x.jsxs)(m,{dpr:n,gl:{antialias:!1,alpha:!1,powerPreference:`high-performance`},orthographic:!0,camera:{position:[0,0,1]},children:[(0,x.jsx)(_,{onDecline:()=>i(e=>Math.max(.5,e*.75)),flipflops:3}),(0,x.jsx)(R,{pal:c,ptr:s})]}),(0,x.jsxs)(`div`,{className:`overlay`,children:[(0,x.jsxs)(a.div,{className:`hero-copy`,initial:{opacity:0,x:-12},animate:{opacity:1,x:0},transition:{duration:.7,delay:.2,ease:[.23,1,.32,1]},children:[(0,x.jsxs)(`p`,{className:`kicker`,children:[(0,x.jsx)(`i`,{style:{background:u.p.glow,boxShadow:`0 0 10px ${u.p.glow}`,transition:`background 1.4s, box-shadow 1.4s`}}),` Raymarching · Smooth-min`]}),(0,x.jsxs)(`h1`,{children:[`慢慢融化的`,(0,x.jsx)(`br`,{}),`一盏光`]}),(0,x.jsx)(`p`,{className:`lv-lede`,children:`整盏灯是一个片元着色器：九团蜡由距离场的 smooth-min 融成一体，被底部的灯加热上浮、冷却下沉，在途中分裂又合并。把指针移进灯里，会从蜡团中拉出一颗液滴。`}),(0,x.jsx)(`div`,{className:`lv-meta`,children:(0,x.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,x.jsxs)(a.span,{initial:{opacity:0,y:8,filter:`blur(4px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},exit:{opacity:0,y:-6,filter:`blur(4px)`},transition:{duration:.45,ease:[.23,1,.32,1]},children:[(0,x.jsx)(`b`,{style:{color:u.p.waxB},children:u.en}),` · `,u.desc]},u.key)})})]}),(0,x.jsx)(`div`,{className:`dock`,children:(0,x.jsx)(g,{items:C.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:t})}),(0,x.jsxs)(`p`,{className:`hint`,children:[D,` blobs · k = 0.16 · ≤ 116 steps`,(0,x.jsx)(`br`,{}),`在灯里移动指针，拉出一颗液滴`]})]})]})}var U=`
.lv .lv-lede { max-width: 410px }
.lv-meta { margin-top: 26px; min-height: 22px; font: 13px/1.5 var(--sans); color: var(--fg-2) }
.lv-meta span { display: inline-block }
.lv-meta b { font: 600 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; margin-right: 2px; transition: color 1.4s }
@media (max-width: 760px) {
  .lv .lv-lede { display: none }
  .lv-meta { margin-top: 14px }
}
`;export{H as default};