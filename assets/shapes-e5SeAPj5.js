import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{E as a,P as o,T as s,Xt as c,h as l,tn as u,u as d,yn as f}from"./events-9ce18a08.esm-BJiOHOtz.js";var p=e(t(),1),m=n(),h=`
uniform float uProgress;
uniform float uTime;
uniform float uSize;
uniform float uScatter;
uniform float uStagger;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
attribute vec3 aTo;
attribute vec4 aRand;
varying vec3 vColor;
varying float vAlpha;

vec3 swirl(vec3 p, float t) {
  return vec3(
    sin(p.y * 1.9 + t) + sin(p.z * 1.3 - t * 0.7),
    sin(p.z * 1.7 + t * 1.1) + sin(p.x * 1.1 + t * 0.6),
    sin(p.x * 1.5 - t * 0.9) + sin(p.y * 1.2 + t * 0.8)
  );
}

void main() {
  float delay = aRand.x * uStagger;
  float k = clamp((uProgress - delay) / (1.0 - uStagger), 0.0, 1.0);
  float e = k < 0.5 ? 4.0 * k * k * k : 1.0 - pow(-2.0 * k + 2.0, 3.0) / 2.0;
  vec3 p = mix(position, aTo, e);
  float mid = sin(e * 3.14159265);
  p += swirl(p * 0.8, uTime * 0.6 + aRand.y * 6.2831) * mid * uScatter * (0.35 + aRand.z * 0.5);
  p += swirl(p * 1.3 + aRand.xyz, uTime * 0.5) * 0.018;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.5 + aRand.w * 0.9) * (1.0 + mid * 0.5) / -mv.z;
  float rim = smoothstep(1.2, 2.8, length(p));
  vColor = mix(mix(uColA, uColB, aRand.y), uColC, clamp(mid * 0.8 + rim * 0.35, 0.0, 1.0));
  vAlpha = (0.45 + aRand.z * 0.55) * mix(0.3, 1.0, smoothstep(-11.0, -6.0, mv.z));
}
`,g=`
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(vColor * a * vAlpha * 1.7, a * vAlpha);
}
`,_=e=>e<.5?4*e*e*e:1-(-2*e+2)**3/2,v=(0,p.forwardRef)(function({count:e,initial:t,colors:n=[`#6b8cff`,`#b48cff`,`#ffffff`],size:v=26,stagger:y=.45},b){let x=l(e=>e.viewport.dpr),S=(0,p.useRef)(null),C=i(1),w=(0,p.useRef)(null),T=(0,p.useMemo)(()=>{let n=new a,r=new Float32Array(e*3);r.set(t.subarray(0,e*3));let i=r.slice(),o=new Float32Array(e*4);for(let e=0;e<o.length;e++)o[e]=Math.random();return n.setAttribute(`position`,new s(r,3)),n.setAttribute(`aTo`,new s(i,3)),n.setAttribute(`aRand`,new s(o,4)),n.boundingSphere=new u(new f,10),n},[e]),E=(0,p.useMemo)(()=>new c({vertexShader:h,fragmentShader:g,transparent:!0,depthWrite:!1,blending:2,uniforms:{uProgress:{value:1},uTime:{value:0},uSize:{value:v},uScatter:{value:1},uStagger:{value:y},uColA:{value:new o(n[0])},uColB:{value:new o(n[1])},uColC:{value:new o(n[2])}}}),[]),D=(0,p.useMemo)(()=>n.map(e=>new o(e)),[n[0],n[1],n[2]]);return d((e,t)=>{let n=E.uniforms;n.uTime.value=e.clock.elapsedTime,n.uProgress.value=C.get(),n.uSize.value=v*x*(e.size.height/900);let r=1-Math.exp(-t*3);n.uColA.value.lerp(D[0],r),n.uColB.value.lerp(D[1],r),n.uColC.value.lerp(D[2],r)}),(0,p.useImperativeHandle)(b,()=>({get points(){return S.current},morphTo(t,n={}){let i=T.attributes.position,a=T.attributes.aTo,o=T.attributes.aRand,s=i.array,c=a.array,l=o.array,u=C.get();if(u<1)for(let t=0;t<e;t++){let e=_(Math.min(1,Math.max(0,(u-l[t*4]*y)/(1-y))));for(let n=0;n<3;n++)s[t*3+n]+=(c[t*3+n]-s[t*3+n])*e}else s.set(c);c.set(t.subarray(0,e*3)),i.needsUpdate=!0,a.needsUpdate=!0,E.uniforms.uScatter.value=n.scatter??1,w.current?.stop(),C.set(0),w.current=r(C,1,{duration:n.duration??2.6,ease:`linear`})}}),[T,E,e,C,y]),(0,m.jsx)(`points`,{ref:S,geometry:T,material:E,frustumCulled:!1})}),y=Math.PI*2,b=(e=1)=>(Math.random()*2-1)*e,x=e=>{let t=new Float32Array(e*3),n=Math.PI*(3-Math.sqrt(5));for(let r=0;r<e;r++){let i=1-r/(e-1)*2,a=Math.sqrt(1-i*i),o=n*r,s=2.2*(1+b(.015));t.set([Math.cos(o)*a*s,i*s,Math.sin(o)*a*s],r*3)}return t},S=e=>{let t=new Float32Array(e*3),n=1.35,r=e=>{let t=Math.cos(e),r=Math.sin(e),i=3/2*e,a=Math.cos(i);return[n*(2+a)*.5*t,n*(2+a)*r*.5,n*Math.sin(i)*.5]};for(let n=0;n<e;n++){let i=n/e*y*2,a=r(i),o=r(i+.01),s=[o[0]-a[0],o[1]-a[1],o[2]-a[2]],c=O(s,[o[0]+a[0],o[1]+a[1],o[2]+a[2]]);k(c);let l=O(c,s);k(l);let u=Math.random()*y,d=.34*Math.sqrt(.75+Math.random()*.25),f=-d*Math.cos(u),p=d*Math.sin(u);t.set([(a[0]+f*l[0]+p*c[0])*1.3,(a[1]+f*l[1]+p*c[1])*1.3,(a[2]+f*l[2]+p*c[2])*1.3],n*3)}return t},C=e=>{let t=new Float32Array(e*3),n=2.6;for(let r=0;r<e;r++){let e=Math.random(),i=(e-.5)*5,a=e*n*y,o=Math.random();if(o<.78){let e=o<.39?0:Math.PI,n=1.05+b(.07);t.set([Math.cos(a+e)*n+b(.05),i+b(.05),Math.sin(a+e)*n+b(.05)],r*3)}else{let i=Math.round(e*34)/34,a=(i-.5)*5,o=i*n*y,s=b(1);t.set([Math.cos(o)*s*1.05,a+b(.02),Math.sin(o)*s*1.05],r*3)}}return t},w=e=>{let t=new Float32Array(e*3),n=Math.ceil(Math.sqrt(e));for(let r=0;r<e;r++){let e=r%n/(n-1)-.5,i=Math.floor(r/n)/(n-1)-.5,a=e*4.2,o=i*4.2;t.set([a,(a*a-o*o)*.28,o],r*3)}return t},T=e=>{let t=new Float32Array(e*3),n=3.6;for(let r=0;r<e;r++){let e=r%3,i=(Math.floor(Math.random()*4)/3-.5)*n,a=(Math.floor(Math.random()*4)/3-.5)*n,o=(Math.random()-.5)*n,s=b(.025),c=e===0?[o,i+s,a]:e===1?[i,o,a+s]:[i+s,a,o];t.set(c,r*3)}return t},E=e=>{let t=new Float32Array(e*3);for(let n=0;n<e;n++){let e=Math.random()**1.6*3,r=n%3/3*y+e*1.35,i=Math.random()**3*(.55-e*.08)+.02;t.set([Math.cos(r)*e+b(i),b(.08)*(1.2-e/3),Math.sin(r)*e+b(i)],n*3)}return t},D=e=>{let t=new Float32Array(e*3);for(let n=0;n<e;n++){let e=Math.random()*y,r=b(.6),i=1.8;t.set([(i+r*Math.cos(e/2))*Math.cos(e),r*Math.sin(e/2),(i+r*Math.cos(e/2))*Math.sin(e)],n*3)}return t};function O(e,t){return[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]]}function k(e){let t=Math.hypot(e[0],e[1],e[2])||1;e[0]/=t,e[1]/=t,e[2]/=t}function A(e){let t=e.length/3;for(let n=t-1;n>0;n--){let t=Math.random()*(n+1)|0;for(let r=0;r<3;r++){let i=e[n*3+r];e[n*3+r]=e[t*3+r],e[t*3+r]=i}}return e}function j(e,t,n=6,r=`700 160px "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif`){let i=document.createElement(`canvas`),a=i.getContext(`2d`,{willReadFrequently:!0});a.font=r;let o=Math.ceil(a.measureText(e).width)+40;i.width=o,i.height=220,a.font=r,a.fillStyle=`#fff`,a.textBaseline=`middle`,a.textAlign=`center`,a.fillText(e,o/2,110);let s=a.getImageData(0,0,o,220).data,c=[];for(let e=0;e<220;e+=2)for(let t=0;t<o;t+=2)s[(e*o+t)*4+3]>128&&c.push(t,e);let l=new Float32Array(t*3),u=n/Math.max(o,600),d=c.length/2;for(let e=0;e<t&&d;e++){let t=Math.random()*d|0;l.set([(c[t*2]-o/2+Math.random()*2)*u,(110-c[t*2+1]+Math.random()*2)*u,b(.06)],e*3)}return l}export{w as a,j as c,D as i,S as l,C as n,A as o,T as r,x as s,E as t,v as u};