import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-spring-RAFdCaft.js";import{n as a,r as o}from"./index-gQ65n0JU.js";import{E as s,P as c,T as l,Y as u,bn as d,h as f,u as p,xt as m,yn as h}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as g}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as _}from"./iso-CLB38p39.js";import{t as v}from"./Seg-CH5KfWEm.js";import{t as y}from"./PerformanceMonitor-DOuNfnyh.js";import{r as b,t as x}from"./glsl-oFfHlTlN.js";var S=e(t(),1),C=n(),w=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,T=9.8,E=8,D=-14,O=3.2,k=[[0,38,.16],[24,24,.14],[-31,17,.13],[58,11,.12],[-52,7.6,.11],[12,5.1,.1],[-78,3.3,.09],[37,2.2,.08]],A=12,j=k.map(([e])=>{let t=m.degToRad(e+A);return[Math.sin(t),Math.cos(t)]}),M=k.map(([,e])=>2*Math.PI/e),N=[{zh:`平静`,en:`Calm`,mul:[.16,.18,.2,.26,.3,.36,.42,.5],foam:.12,chop:.55,sss:.7},{zh:`微浪`,en:`Breeze`,mul:[.55,.55,.58,.6,.64,.66,.7,.72],foam:.56,chop:1,sss:1},{zh:`大浪`,en:`Swell`,mul:[1.06,1,.95,.9,.86,.8,.74,.7],foam:.74,chop:1.35,sss:1.25}],P=[[.42,.91,5.7,.05],[-.77,.64,8.9,.045],[.95,-.31,13.1,.04],[-.2,-.98,19.7,.035],[.61,.79,29.3,.03]];function F(e,t,n,r,i){let a=0,o=0,s=0;for(let i=0;i<E;i++){let[c,l]=j[i],u=M[i],d=u*(c*e+l*t)-Math.sqrt(T*u)*n,f=r[i]/u,p=Math.cos(d);a+=c*f*p,s+=l*f*p,o+=f*Math.sin(d)}return i.set(e+a,o,t+s)}function I(e,t,n,r,i){let a=e,o=t;for(let s=0;s<4;s++)F(a,o,n,r,i),a+=e-i.x,o+=t-i.z;return F(a,o,n,r,i).y}var L=[{zh:`黄昏`,clock:`18:42`,dot:`#ff9a5a`,c:{zenith:`#141b48`,mid:`#5b4590`,horizon:`#ff9a5c`,glow:`#ff7436`,sun:`#ffc489`,cloudLit:`#ff8a64`,cloudDark:`#3d2c58`,deep:`#07103a`,sss:`#2a7a80`,sail:`#ffb27a`},n:{el:2.4,az:0,sunSize:.028,sunInt:26,glowInt:1,stars:0,cloud:.9,exposure:1,spec:1.6,hemi:.9,key:2.6,fog:.0042,sailGlow:.35}},{zh:`蓝调时刻`,clock:`19:26`,dot:`#8fa8ff`,c:{zenith:`#081233`,mid:`#1d3470`,horizon:`#9a86b8`,glow:`#7f9be6`,sun:`#d9e4ff`,cloudLit:`#a497cf`,cloudDark:`#18234c`,deep:`#040b1e`,sss:`#1a4c7c`,sail:`#8fa8ff`},n:{el:9,az:7,sunSize:.011,sunInt:22,glowInt:.4,stars:1,cloud:.6,exposure:1.15,spec:.9,hemi:.9,key:.9,fog:.0038,sailGlow:.08}},{zh:`正午`,clock:`12:04`,dot:`#ffe08a`,c:{zenith:`#1f5fbf`,mid:`#5c9ee0`,horizon:`#c9e1f0`,glow:`#fff1d0`,sun:`#fff6e6`,cloudLit:`#ffffff`,cloudDark:`#9fb6d0`,deep:`#03284a`,sss:`#14a89c`,sail:`#fff4de`},n:{el:26,az:6,sunSize:.02,sunInt:40,glowInt:.45,stars:0,cloud:.65,exposure:.85,spec:2.2,hemi:2.2,key:3.2,fog:.0032,sailGlow:.42}}],R=e=>{let t=new c(e);return[t.r,t.g,t.b]};function z(e){let t={};for(let[n,r]of Object.entries(e.c))t[n]=R(r);for(let[n,r]of Object.entries(e.n))t[n]=[r];return t}var B=`
uniform vec3 uSunDir;
uniform vec3 uZenith, uMid, uHorizon, uGlow, uSunCol, uCloudLit, uCloudDark;
uniform float uSunSize, uSunInt, uGlowInt, uStars, uCloud, uTime;

${x}

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }

// clouds: 1 = draw cloud streaks, disk: 1 = draw the sun disk
vec3 skyCol(vec3 d, float clouds, float disk) {
  float y = max(d.y, 0.0);
  float mu = dot(d, uSunDir);
  vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.2, pow(y, 0.8)));
  c = mix(c, uZenith, smoothstep(0.06, 0.55, y));
  // the warm band of the horizon reaches round towards the sun's azimuth
  float az = max(dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz + 1e-5)), 0.0);
  float mup = max(mu, 0.0);
  c += uGlow * uGlowInt * ((0.18 * pow(mup, 4.0) + 0.5 * pow(mup, 16.0)) * exp(-y * 5.0) + 0.3 * exp(-y * 12.0) * az * az + 1.4 * pow(mup, 120.0));
  if (disk > 0.5) {
    float dd = smoothstep(cos(uSunSize * 1.3), cos(uSunSize), mu) * smoothstep(-0.002, 0.004, d.y);
    c += uSunCol * uSunInt * dd;
  }
  if (clouds > 0.5 && y > 0.0) {
    // thin stratus streaks low over the sea, lit from the sun's side
    vec2 cp = d.xz / (y + 0.07);
    float n = snoise(vec3(cp.x * 0.16 + uTime * 0.006, cp.y * 0.55, 1.7)) * 0.65 + snoise(vec3(cp.x * 0.5, cp.y * 1.7 - uTime * 0.004, 4.3)) * 0.35;
    float cl = smoothstep(0.08, 0.7, n) * smoothstep(0.012, 0.07, y) * smoothstep(0.42, 0.1, y) * uCloud;
    vec3 cc = mix(uCloudDark, uCloudLit, pow(mup * 0.5 + 0.5, 4.0) * (0.6 + 0.4 * exp(-y * 6.0)));
    c = mix(c, cc, cl * 0.85);
  }
  return c;
}
`,V=`
uniform vec4 uWave[${E}];
uniform float uTime;
attribute float aSpacing;
varying vec3 vWorld;
varying vec2 vXZ;
varying float vH;
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vec2 x0 = p.xz;
  vec3 disp = vec3(0.0);
  for (int i = 0; i < ${E}; i++) {
    vec4 w = uWave[i];
    float k = w.z;
    float L = 6.2831853 / k;
    // waves the local grid can't resolve are left to the per-pixel normals
    float a = w.w / k * smoothstep(3.5 * aSpacing, 7.0 * aSpacing, L);
    float f = k * dot(w.xy, x0) - sqrt(9.8 * k) * uTime;
    float c = cos(f);
    disp += vec3(w.x * a * c, a * sin(f), w.y * a * c);
  }
  p += disp;
  vWorld = p;
  vXZ = x0;
  vH = disp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`,H=`
uniform vec4 uWave[${E}];
uniform vec3 uDeep, uSss;
uniform float uSpec, uFoam, uChop, uSssK, uAmp, uFogD;
varying vec3 vWorld;
varying vec2 vXZ;
varying float vH;
${B}

const vec4 DET[5] = vec4[5](${P.map(e=>`vec4(${e.map(e=>e.toFixed(3)).join(`, `)})`).join(`, `)});

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 x0 = vXZ;
  float foot = max(length(fwidth(x0)), 1e-4); // metres per pixel

  // ---- analytic Gerstner normal + Jacobian, re-evaluated per pixel
  vec3 T = vec3(1.0, 0.0, 0.0);
  vec3 B = vec3(0.0, 0.0, 1.0);
  float jxx = 1.0, jzz = 1.0, jxz = 0.0;
  for (int i = 0; i < ${E}; i++) {
    vec4 w = uWave[i];
    float k = w.z;
    float L = 6.2831853 / k;
    float s = w.w * (1.0 - smoothstep(L * 0.07, L * 0.28, foot));
    float f = k * dot(w.xy, x0) - sqrt(9.8 * k) * uTime;
    float sn = sin(f) * s;
    float cs = cos(f) * s;
    T += vec3(-w.x * w.x * sn, w.x * cs, -w.x * w.y * sn);
    B += vec3(-w.x * w.y * sn, w.y * cs, -w.y * w.y * sn);
    jxx -= w.x * w.x * sn;
    jzz -= w.y * w.y * sn;
    jxz -= w.x * w.y * sn;
  }
  vec3 N = normalize(cross(B, T));

  // ---- capillary ripples (normal only), gone once a pixel covers them
  vec2 g = vec2(0.0);
  for (int j = 0; j < 5; j++) {
    vec4 d = DET[j];
    float L = 6.2831853 / d.z;
    float fade = 1.0 - smoothstep(L * 0.12, L * 0.45, foot);
    float f = d.z * dot(d.xy, x0) - sqrt(9.8 * d.z) * uTime * 1.1 + float(j) * 1.7;
    g += d.xy * d.w * cos(f) * fade;
  }
  N = normalize(N - vec3(g.x, 0.0, g.y) * uChop);
  float rough = smoothstep(0.015, 1.6, foot);

  vec3 L = uSunDir;
  float sunVis = smoothstep(-0.03, 0.02, L.y);

  // ---- reflection
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.002;
  R = normalize(R);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  F = mix(F, 0.6, rough * 0.35);
  vec3 refl = skyCol(R, 1.0, 0.0);

  // ---- water body + light leaking through thin crests (strongest when looking into the light)
  float diff = max(dot(N, L), 0.0);
  vec3 body = uDeep * (0.6 + 0.4 * diff);
  float crest = clamp(vH / max(uAmp, 0.05) * 0.55 + 0.35, 0.0, 1.0);
  float into = pow(max(dot(normalize(-V.xz), normalize(L.xz + 1e-5)), 0.0), 3.0);
  body += uSss * crest * crest * (0.25 + 0.75 * into) * pow(1.0 - ndv, 1.5) * uSssK * (1.0 - smoothstep(40.0, 220.0, dist)) * (0.3 + 0.7 * sunVis);
  vec3 col = mix(body, refl, F);

  // ---- the sun path: a tight lobe that widens with distance, plus twinkling facets
  float mu = max(dot(R, L), 0.0);
  float shine = mix(1400.0, 70.0, rough);
  float spec = pow(mu, shine) * (shine + 8.0) / 60.0 + pow(mu, 24.0) * 0.06;
  // sparkles: one random point per 12 cm cell, drawn ~1 px wide, only on facets near the sun lobe
  vec2 cell = floor(x0 * 8.0);
  float fr = floor(uTime * 6.0);
  float sp = hash12(cell + fr * 13.37);
  vec2 spo = vec2(hash12(cell + 3.1 + fr), hash12(cell - 5.7 + fr)) * 0.8 + 0.1;
  float spd = length(fract(x0 * 8.0) - spo) / 8.0;
  spec += step(0.97, sp) * smoothstep(foot * 1.6, foot * 0.4, spd) * pow(mu, 180.0) * 40.0 * (1.0 - rough);
  col += uSunCol * uSpec * spec * sunVis;

  // ---- foam where the surface bunches up (Jacobian < threshold)
  float J = jxx * jzz - jxz * jxz;
  if (J < uFoam + 0.05) {
    float n1 = snoise(vec3(x0 * 0.32, uTime * 0.12)) * 0.5 + 0.5;
    float n2 = snoise(vec3(x0 * 1.5 + 7.0, uTime * 0.3)) * 0.5 + 0.5;
    float n3 = snoise(vec3(x0 * 4.2 - 3.0, uTime * 0.5)) * 0.5 + 0.5;
    float m = smoothstep(uFoam, uFoam - 0.2, J);
    // lacy whitecaps: the mask eats into the noise, so thin foam breaks into filaments
    float foam = smoothstep(0.62 - m * 0.3, 0.7 - m * 0.3, n1 * 0.45 + n2 * 0.35 + n3 * 0.3) * m;
    foam *= 1.0 - smoothstep(40.0, 170.0, dist);
    vec3 foamCol = mix(uMid, uHorizon, 0.5) * 0.75 + uSunCol * (0.25 + 0.6 * diff) * sunVis * 0.6;
    col = mix(col, foamCol, foam * 0.9);
  }

  // ---- distance haze into the horizon colour of the same sky
  vec3 haze = skyCol(normalize(vec3(-V.x, 0.0, -V.z)), 0.0, 0.0);
  float fog = 1.0 - exp(-dist * uFogD);
  fog = max(fog, smoothstep(300.0, 620.0, dist));
  col = mix(col, haze, fog);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
}
`,U=`
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`,W=`
varying vec3 vWorld;
${B}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  vec3 c;
  if (d.y < 0.0) {
    c = skyCol(normalize(vec3(d.x, 0.0, d.z)), 0.0, 0.0);
  } else {
    c = skyCol(d, 1.0, 1.0);
    if (uStars > 0.001) {
      vec3 sd = d * 240.0;
      vec3 id = floor(sd);
      float h = hash13(id);
      float st = step(0.992, h) * smoothstep(0.42, 0.0, length(fract(sd) - 0.5));
      st *= 0.55 + 0.45 * sin(uTime * (1.5 + h * 3.0) + h * 80.0);
      c += vec3(0.9, 0.95, 1.0) * st * uStars * smoothstep(0.06, 0.35, d.y) * 1.6;
    }
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
}
`;function G(e){let t=e=>Math.sign(e)*(40*Math.abs(e)+600*e**4),n=e=>40+2400*Math.abs(e)**3,r=e+1,i=new Float32Array(r*r*3),a=new Float32Array(r*r);for(let o=0;o<r;o++)for(let s=0;s<r;s++){let c=-1+2*s/e,l=-1+2*o/e,u=o*r+s;i[u*3]=t(c),i[u*3+2]=t(l),a[u]=Math.max(n(c),n(l))*2/e}let o=new Uint32Array(e*e*6),c=0;for(let t=0;t<e;t++)for(let n=0;n<e;n++){let e=t*r+n,i=e+1,a=e+r,s=a+1;o[c++]=e,o[c++]=a,o[c++]=i,o[c++]=i,o[c++]=a,o[c++]=s}let u=new s;return u.setAttribute(`position`,new l(i,3)),u.setAttribute(`aSpacing`,new l(a,1)),u.setIndex(new l(o,1)),u}function K(){let e=[[-1.62,.5,.42],[-1.1,.62,.38],[-.4,.67,.36],[.3,.63,.38],[.9,.5,.43],[1.4,.28,.5],[1.78,0,.6]].map(e=>{let[t,n,r]=e,i=Math.max(0,(t-.9)/.9);return[new h(-n,r,t),new h(-n*.86,-.06,t),new h(0,-.36+i*.3,t),new h(n*.86,-.06,t),new h(n,r,t)]}),t=[],n=(e,n,r,i)=>t.push(e,n,r,e,r,i);for(let t=0;t<e.length-1;t++){let r=e[t],i=e[t+1];for(let e=0;e<4;e++)n(r[e],r[e+1],i[e+1],i[e])}let r=e[0];t.push(r[0],r[2],r[1],r[0],r[4],r[2],r[2],r[4],r[3]);let i=new s().setFromPoints(t);i.computeVertexNormals();let a=[],o=new h(0,.33,0),c=[...e.map(e=>e[4]),...e.slice().reverse().map(e=>e[0])];for(let e=0;e<c.length;e++){let t=c[e].clone().setY(c[e].y-.05),n=c[(e+1)%c.length].clone().setY(c[(e+1)%c.length].y-.05);a.push(o,n,t)}let l=new s().setFromPoints(a);l.computeVertexNormals();let u=[],d=new h(0,.75,.42),f=new h(0,4,.42),p=new h(0,.82,-1.45),m=(e,t)=>e.clone().setX(e.x+t),g=m(d.clone().lerp(p,.5),.12),_=m(f.clone().lerp(p,.5),.2),v=m(d.clone().lerp(f,.5),.05);u.push(d,g,v,g,_,v,g,p,_,v,_,f);let y=new h(0,3.3,.46),b=new h(0,.62,1.7),x=new h(.1,.8,.62),S=m(y.clone().lerp(x,.5),.1);u.push(y,b,S,S,b,x);let C=new s().setFromPoints(u);return C.computeVertexNormals(),{hull:i,deck:l,sails:C}}function q({sea:e,seaX:t,tod:n,px:r,py:i}){let a=f(e=>e.camera),o=f(e=>e.size),s=f(e=>e.gl),l=(0,S.useMemo)(()=>({uTime:{value:0},uWave:{value:Array.from({length:E},(e,t)=>new d(j[t][0],j[t][1],M[t],0))},uSunDir:{value:new h(0,.05,-1).normalize()},uZenith:{value:new c},uMid:{value:new c},uHorizon:{value:new c},uGlow:{value:new c},uSunCol:{value:new c},uCloudLit:{value:new c},uCloudDark:{value:new c},uDeep:{value:new c},uSss:{value:new c},uSunSize:{value:.02},uSunInt:{value:20},uGlowInt:{value:1},uStars:{value:0},uCloud:{value:1},uSpec:{value:1},uFoam:{value:.5},uChop:{value:1},uSssK:{value:1},uAmp:{value:1},uFogD:{value:.004}}),[]),g=b(()=>({vertexShader:V,fragmentShader:H,uniforms:l,side:2})),v=b(()=>({vertexShader:U,fragmentShader:W,uniforms:l,side:1,depthWrite:!1})),y=(0,S.useMemo)(()=>G(w?220:420),[]),x=(0,S.useMemo)(()=>K(),[]);(0,S.useEffect)(()=>()=>{y.dispose(),x.hull.dispose(),x.deck.dispose(),x.sails.dispose()},[y,x]);let T=(0,S.useRef)(null),k=(0,S.useRef)(null),A=(0,S.useRef)(null),N=(0,S.useRef)(null),P=(0,S.useMemo)(()=>({t:_?14:0,v:new h,look:new h,e:new u(0,0,0,`YXZ`),y:0,pitch:0,roll:0,init:!1}),[]);return p((c,u)=>{let d=Math.min(u,1/30);P.t+=d;let f=P.t,p=e.current,h=n.current;l.uTime.value=f;let g=0;for(let e=0;e<E;e++)l.uWave.value[e].w=p[e],g+=p[e]/M[e];l.uAmp.value=g;let v=m.degToRad(h.el[0]),y=m.degToRad(h.az[0]);l.uSunDir.value.set(Math.sin(y)*Math.cos(v),Math.sin(v),-Math.cos(y)*Math.cos(v)),l.uZenith.value.fromArray(h.zenith),l.uMid.value.fromArray(h.mid),l.uHorizon.value.fromArray(h.horizon),l.uGlow.value.fromArray(h.glow),l.uSunCol.value.fromArray(h.sun),l.uCloudLit.value.fromArray(h.cloudLit),l.uCloudDark.value.fromArray(h.cloudDark),l.uDeep.value.fromArray(h.deep),l.uSss.value.fromArray(h.sss),l.uSunSize.value=h.sunSize[0],l.uSunInt.value=h.sunInt[0],l.uGlowInt.value=h.glowInt[0],l.uStars.value=h.stars[0],l.uCloud.value=h.cloud[0],l.uSpec.value=h.spec[0],l.uFogD.value=h.fog[0];let b=t.current;l.uFoam.value=b.foam,l.uChop.value=b.chop,l.uSssK.value=b.sss,s.toneMappingExposure=h.exposure[0],A.current&&(A.current.position.copy(l.uSunDir.value).multiplyScalar(60),A.current.color.fromArray(h.sun),A.current.intensity=h.key[0]*m.smoothstep(h.el[0],-2,3)),N.current&&(N.current.color.fromArray(h.mid),N.current.groundColor.fromArray(h.deep),N.current.intensity=h.hemi[0]),k.current&&(k.current.emissive.fromArray(h.sail),k.current.emissiveIntensity=h.sailGlow[0]);let x=o.width<o.height,S=o.width<760,C=x?62:50;a.fov!==C&&(a.fov=C,a.updateProjectionMatrix());let w=_||S?.02:-.13,D=x?-.13:-.11,j=w+r.get()*.07-Math.sin(f*.05)*.015,F=D+i.get()*.03;a.position.set(r.get()*.5,O+Math.sin(f*.4)*.05+i.get()*.15,0),P.look.set(Math.sin(j)*Math.cos(F),Math.sin(F),-Math.cos(j)*Math.cos(F)).add(a.position),a.lookAt(P.look);let L=T.current;if(L){let e=2.05+Math.sin(f*.07)*.12,t=(S&&!_?-1.9:-2.5)+Math.sin(f*.045)*.35,n=Math.sin(e),r=Math.cos(e),i=P.v,a=1.5,o=.55,s=I(t+n*a,-21+r*a,f,p,i),c=I(t-n*a,-21-r*a,f,p,i),l=I(t+r*o,-21-n*o,f,p,i),u=I(t-r*o,-21+n*o,f,p,i),h=I(t,-21,f,p,i)*.5+(s+c+l+u)*.125,g=-Math.atan2(s-c,a*2),v=Math.atan2(l-u,o*2);P.init||(P.init=!0,P.y=h,P.pitch=g,P.roll=v),P.y=m.damp(P.y,h,6,d),P.pitch=m.damp(P.pitch,g,4,d),P.roll=m.damp(P.roll,v,3.5,d),L.position.set(t,P.y-.04,-21),P.e.set(P.pitch,e,P.roll+Math.sin(f*.9)*.015),L.quaternion.setFromEuler(P.e)}}),(0,C.jsxs)(C.Fragment,{children:[(0,C.jsx)(`mesh`,{material:v,renderOrder:-1,frustumCulled:!1,children:(0,C.jsx)(`sphereGeometry`,{args:[1800,48,24]})}),(0,C.jsx)(`mesh`,{geometry:y,material:g,position:[0,0,D],frustumCulled:!1}),(0,C.jsx)(`hemisphereLight`,{ref:N}),(0,C.jsx)(`directionalLight`,{ref:A}),(0,C.jsxs)(`group`,{ref:T,children:[(0,C.jsx)(`mesh`,{geometry:x.hull,children:(0,C.jsx)(`meshStandardMaterial`,{color:`#3b2722`,roughness:.75,flatShading:!0})}),(0,C.jsx)(`mesh`,{geometry:x.deck,children:(0,C.jsx)(`meshStandardMaterial`,{color:`#9a7652`,roughness:.8,flatShading:!0})}),(0,C.jsxs)(`mesh`,{position:[0,2.3,.42],children:[(0,C.jsx)(`cylinderGeometry`,{args:[.035,.05,4.1,6]}),(0,C.jsx)(`meshStandardMaterial`,{color:`#2a1f1c`,roughness:.6})]}),(0,C.jsxs)(`mesh`,{position:[0,.8,-.5],rotation:[Math.PI/2,0,0],children:[(0,C.jsx)(`cylinderGeometry`,{args:[.03,.03,1.9,5]}),(0,C.jsx)(`meshStandardMaterial`,{color:`#2a1f1c`,roughness:.6})]}),(0,C.jsx)(`mesh`,{geometry:x.sails,children:(0,C.jsx)(`meshStandardMaterial`,{ref:k,color:`#efe4d0`,roughness:.9,side:2,flatShading:!0})})]})]})}function J(){let[e,t]=(0,S.useState)(1),[n,s]=(0,S.useState)(0),[c,l]=(0,S.useState)(()=>Math.min(typeof window<`u`&&window.devicePixelRatio||1,w?1.5:1.75)),u=(0,S.useRef)(k.map(([,,e],t)=>e*N[1].mul[t])),d=(0,S.useRef)({foam:N[1].foam,chop:N[1].chop,sss:N[1].sss}),f=(0,S.useRef)(z(L[0])),p=i(0,{stiffness:18,damping:12,mass:1.2}),m=i(0,{stiffness:18,damping:12,mass:1.2});(0,S.useEffect)(()=>{let t=[...u.current],n={...d.current},i=N[e],a=k.map(([,,e],t)=>e*i.mul[t]),o=r(0,1,{duration:2.6,ease:[.45,0,.25,1],onUpdate:e=>{for(let n=0;n<E;n++)u.current[n]=t[n]+(a[n]-t[n])*e;d.current.foam=n.foam+(i.foam-n.foam)*e,d.current.chop=n.chop+(i.chop-n.chop)*e,d.current.sss=n.sss+(i.sss-n.sss)*e}});return()=>o.stop()},[e]),(0,S.useEffect)(()=>{let e={};for(let[t,n]of Object.entries(f.current))e[t]=[...n];let t=z(L[n]),i=r(0,1,{duration:2.4,ease:[.45,0,.2,1],onUpdate:n=>{for(let r in t)for(let i=0;i<t[r].length;i++)f.current[r][i]=e[r][i]+(t[r][i]-e[r][i])*n}});return()=>i.stop()},[n]);let h=e=>{let t=e.currentTarget.getBoundingClientRect();p.set((e.clientX-t.left)/t.width*2-1),m.set(-((e.clientY-t.top)/t.height*2-1))},_=()=>{p.set(0),m.set(0)},b=L[n],x=N[e];return(0,C.jsxs)(`div`,{className:`stage so`,style:{background:`#120f1f`},onPointerMove:h,onPointerLeave:_,children:[(0,C.jsx)(`style`,{children:Y}),(0,C.jsxs)(g,{dpr:c,gl:{antialias:!0,alpha:!1,powerPreference:`high-performance`},camera:{fov:50,near:.1,far:4e3,position:[0,O,0]},children:[(0,C.jsx)(y,{onDecline:()=>l(e=>Math.max(.75,e*.8)),flipflops:3}),(0,C.jsx)(q,{sea:u,seaX:d,tod:f,px:p,py:m})]}),(0,C.jsxs)(`div`,{className:`overlay`,children:[(0,C.jsxs)(a.div,{className:`so-copy soft-text`,initial:{opacity:0,y:14,filter:`blur(6px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},transition:{duration:.9,delay:.25,ease:[.23,1,.32,1]},children:[(0,C.jsxs)(`p`,{className:`so-kicker`,children:[(0,C.jsx)(`i`,{style:{background:b.dot,boxShadow:`0 0 12px ${b.dot}`}}),(0,C.jsx)(`span`,{children:`GERSTNER × 8 ·`}),(0,C.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,C.jsx)(a.span,{initial:{opacity:0,y:8},animate:{opacity:1,y:0},exit:{opacity:0,y:-8},transition:{duration:.4,ease:[.23,1,.32,1]},children:b.clock},b.clock)})]}),(0,C.jsx)(`h1`,{children:`海，永远不重复`}),(0,C.jsx)(`p`,{className:`so-sub`,children:`八组 Gerstner 波在顶点里叠加，菲涅尔把天空映进每一道浪；小船读取同一个波函数，随浪起伏。`}),(0,C.jsx)(`p`,{className:`so-state`,children:(0,C.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,C.jsxs)(a.span,{initial:{opacity:0,filter:`blur(4px)`},animate:{opacity:1,filter:`blur(0px)`},exit:{opacity:0,filter:`blur(4px)`},transition:{duration:.45},children:[`Σ steepness `,k.reduce((e,[,,t],n)=>e+t*x.mul[n],0).toFixed(2),` · `,x.en]},x.en)})})]}),(0,C.jsxs)(`div`,{className:`dock`,children:[(0,C.jsx)(v,{items:N.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:t}),(0,C.jsx)(`span`,{className:`dock-sep`}),(0,C.jsx)(v,{items:L.map((e,t)=>({value:t,label:e.zh})),value:n,onChange:s})]}),(0,C.jsx)(`p`,{className:`hint`,children:`移动指针 · 视线随之轻移`})]})]})}var Y=`
.so-copy {
  --soft-bg: #07080f;
  position: absolute; left: clamp(24px, 6vw, 96px); bottom: 112px;
  max-width: 430px; pointer-events: none !important;
}
.so-copy { isolation: isolate; }
.so-copy::before {
  content: ''; position: absolute; z-index: -1; left: -140px; right: -160px; top: -90px; bottom: -70px;
  background: radial-gradient(closest-side, rgba(6, 8, 18, .42), rgba(6, 8, 18, .2) 55%, transparent);
  pointer-events: none;
}
.so-kicker {
  display: flex; align-items: center; gap: 8px; margin: 0 0 16px;
  font: 500 12px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2);
}
.so-kicker i { width: 6px; height: 6px; border-radius: 50%; transition: background 1.6s, box-shadow 1.6s; }
.so-kicker span { display: inline-block; }
.so-copy h1 { margin: 0; font: 600 clamp(34px, 4vw, 56px)/1.06 var(--display); letter-spacing: -.035em; }
.so-sub { margin: 14px 0 0; font-size: 14.5px; line-height: 1.75; color: var(--fg-2); }
.so-state { margin: 18px 0 0; min-height: 18px; font: 500 11.5px/1.5 var(--mono); letter-spacing: .04em; color: var(--fg-2); opacity: .8 }
.so-state span { display: inline-block }
@media (max-width: 760px) {
  .so .dock .seg { padding: 0 10px; }
  .so-copy { bottom: 96px; right: 24px; }
  .so-copy h1 { font-size: 32px; }
  .so-sub { font-size: 13px; }
  .so-state { display: none }
}
`;export{J as default};