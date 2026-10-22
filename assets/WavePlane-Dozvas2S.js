import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{E as a,T as o,Xt as s,h as c,u as l,xt as u}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as d}from"./react-three-fiber.esm-zWEOtJjG.js";import{t as f}from"./Seg-CH5KfWEm.js";import{t as p}from"./BigLabel-CceM23C6.js";import{t as m}from"./fit-oWU2iFZb.js";var h=e(t(),1),g=n(),_=typeof window<`u`&&window.innerWidth<760?150:230,v=[{zh:`涟漪`,en:`Ripple`,aside:`y = sin(kd − ωt) · e^(−d)`},{zh:`干涉`,en:`Interference`,aside:`two point sources`},{zh:`螺旋面`,en:`Helicoid`,aside:`twisting ribbon`},{zh:`圆筒`,en:`Rolled Cylinder`,aside:`x = r·sin(πu)`},{zh:`球面`,en:`Folded Sphere`,aside:`lat = πv/2, lon = πu`},{zh:`环面`,en:`Torus`,aside:`R = 1.7, r = 0.75`}],y=`
uniform float uTime;
uniform float uFrom;
uniform float uTo;
uniform float uProg;
uniform float uSize;
attribute vec2 aUv;
attribute float aRand;
varying vec3 vColor;
varying float vAlpha;

const float PI = 3.14159265;
const float R = 3.2;

vec3 surf(float m, vec2 uv, float t) {
  float u = uv.x, v = uv.y;
  if (m < 0.5) {
    float d = length(uv) * R;
    return vec3(u * R, sin(d * 2.4 - t * 2.2) * 0.32 * exp(-d * 0.25), v * R);
  } else if (m < 1.5) {
    vec2 p = uv * R;
    float d1 = length(p - vec2(-1.3, 0.0));
    float d2 = length(p - vec2(1.3, 0.0));
    return vec3(p.x, (sin(d1 * 4.2 - t * 2.6) + sin(d2 * 4.2 - t * 2.6)) * 0.12, p.y);
  } else if (m < 2.5) {
    float a = u * PI * 1.25 + t * 0.6;
    return vec3(u * R, v * 1.5 * sin(a), v * 1.5 * cos(a));
  } else if (m < 3.5) {
    float r = R / PI;
    float a = u * PI + t * 0.25;
    float wob = 1.0 + 0.06 * sin(v * 9.0 - t * 2.0);
    return vec3(sin(a) * r * 1.35 * wob, cos(a) * r * 1.35 * wob, v * R);
  } else if (m < 4.5) {
    float lat = v * PI * 0.5;
    float lon = u * PI + t * 0.25;
    float r = 2.05 + 0.05 * sin(lat * 10.0 + t * 2.0);
    return vec3(cos(lat) * sin(lon) * r, sin(lat) * r, cos(lat) * cos(lon) * r);
  }
  float a = u * PI + t * 0.2;
  float b = v * PI + t * 0.5;
  float rr = 1.7 + 0.75 * cos(b);
  return vec3(cos(a) * rr, 0.75 * sin(b), sin(a) * rr);
}

void main() {
  float sweep = (aUv.x * 0.5 + 0.5) * 0.45;
  float k = clamp((uProg - sweep) / 0.55, 0.0, 1.0);
  float e = k * k * (3.0 - 2.0 * k);
  vec3 p = mix(surf(uFrom, aUv, uTime), surf(uTo, aUv, uTime), e);
  float flight = sin(e * PI);
  p.y += flight * 0.25 * sin(aUv.x * 6.0 + uTime * 3.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.7 + aRand * 0.6) / -mv.z;
  float h = clamp(p.y * 0.9 + 0.5, 0.0, 1.0);
  vec3 deep = vec3(0.10, 0.36, 0.62);
  vec3 teal = vec3(0.25, 0.85, 0.78);
  vec3 crest = vec3(0.92, 1.0, 0.97);
  vColor = mix(mix(deep, teal, h), crest, smoothstep(0.75, 1.0, h) * 0.8 + flight * 0.25);
  vAlpha = mix(0.25, 1.0, smoothstep(-13.0, -5.5, mv.z));
}
`,b=`
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`;function x({mode:e}){let t=c(e=>e.viewport.dpr),n=i(1),d=(0,h.useRef)(null),f=(0,h.useRef)(null),p=m(1.05),v=(0,h.useMemo)(()=>{let e=_*_,t=new a,n=new Float32Array(e*2),r=new Float32Array(e);for(let t=0;t<e;t++)n[t*2]=t%_/(_-1)*2-1,n[t*2+1]=Math.floor(t/_)/(_-1)*2-1,r[t]=Math.random();return t.setAttribute(`position`,new o(new Float32Array(e*3),3)),t.setAttribute(`aUv`,new o(n,2)),t.setAttribute(`aRand`,new o(r,1)),t},[]),x=(0,h.useMemo)(()=>new s({vertexShader:y,fragmentShader:b,transparent:!0,depthWrite:!1,blending:2,uniforms:{uTime:{value:0},uFrom:{value:0},uTo:{value:0},uProg:{value:1},uSize:{value:30}}}),[]);return(0,h.useEffect)(()=>{let t=x.uniforms;t.uTo.value!==e&&(t.uFrom.value=n.get()>.5?t.uTo.value:t.uFrom.value,t.uTo.value=e,d.current?.stop(),n.set(0),d.current=r(n,1,{duration:2.4,ease:`linear`}))},[e,x,n]),l((e,r)=>{x.uniforms.uTime.value=e.clock.elapsedTime,x.uniforms.uProg.value=n.get(),x.uniforms.uSize.value=26*t*(e.size.height/900);let i=f.current;i&&(i.rotation.y+=r*.08,i.rotation.x=u.damp(i.rotation.x,.42-e.pointer.y*.2,2,r))}),(0,g.jsx)(`group`,{ref:f,scale:p,children:(0,g.jsx)(`points`,{geometry:v,material:x,frustumCulled:!1})})}function S(){let[e,t]=(0,h.useState)(0),[n,r]=(0,h.useState)(!0);(0,h.useEffect)(()=>{if(!n)return;let e=setInterval(()=>t(e=>(e+1)%v.length),5600);return()=>clearInterval(e)},[n]);let i=v[e];return(0,g.jsxs)(`div`,{className:`stage`,style:{background:`radial-gradient(100% 80% at 50% 40%, #0c2230 0%, #050c12 75%)`},children:[(0,g.jsx)(d,{dpr:[1,2],camera:{position:[0,.6,8],fov:42},gl:{antialias:!1,alpha:!0},children:(0,g.jsx)(x,{mode:e})}),(0,g.jsxs)(`div`,{className:`overlay`,children:[(0,g.jsx)(p,{id:String(e),meta:`${String(e+1).padStart(2,`0`)} / ${String(v.length).padStart(2,`0`)} · ${(_*_).toLocaleString()} particles · one (u, v) grid`,title:i.zh,sub:i.en,aside:i.aside}),(0,g.jsxs)(`div`,{className:`dock`,children:[(0,g.jsx)(f,{items:v.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:e=>{t(e),r(!1)}}),(0,g.jsx)(`span`,{className:`dock-sep`}),(0,g.jsx)(`button`,{className:`seg`,"aria-pressed":n,onClick:()=>r(e=>!e),children:(0,g.jsx)(`span`,{children:n?`暂停`:`播放`})})]})]})]})}export{S as default};