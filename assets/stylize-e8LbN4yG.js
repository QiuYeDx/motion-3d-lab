import{a as e,n as t}from"./jsx-runtime-D3jfb0Ew.js";import{$ as n,B as r,E as i,Ot as a,P as o,Pt as s,Sn as c,W as l,Xt as u,Yt as d,_n as f,h as p,it as m,jt as h,pt as g,u as _,vn as v,wt as y,xt as b}from"./events-9ce18a08.esm-BJiOHOtz.js";var x=e(t(),1),S=`
precision highp float;
uniform sampler2D tScene;   // scene colour (linear, un-tonemapped)
uniform sampler2D tNormal;  // view-space normal * 0.5 + 0.5, alpha 0 where empty (only if effect.normals)
uniform sampler2D tDepth;   // depth buffer
uniform vec2 uRes;          // drawing buffer size, device px
uniform vec2 uSceneRes;     // scene target size, px
uniform float uDpr;
uniform float uTime;
uniform float uNear;
uniform float uFar;
uniform float uOrtho;       // 1 for orthographic cameras
uniform float uExposure;
uniform vec2 uClip;         // effect only drawn where uClip.x <= wipeCoord(px) < uClip.y
varying vec2 vUv;

vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** scene colour (display-referred sRGB, 0..1) at device px */
vec3 sceneAt(vec2 px) {
  vec3 c = texture2D(tScene, px / uRes).rgb * uExposure;
  c = c / (1.0 + c * 0.12); // gentle shoulder so highlights don't clip flat
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
/** same, sampled at a uv (0..1) */
vec3 sceneUv(vec2 uv) { return sceneAt(uv * uRes); }
/** view-space normal (-1..1); vec3(0) where nothing was drawn */
vec3 normalAt(vec2 px) {
  vec4 n = texture2D(tNormal, px / uRes);
  return n.a < 0.5 ? vec3(0.0) : normalize(n.rgb * 2.0 - 1.0);
}
/** 1 where geometry was drawn, 0 on the background */
float coverageAt(vec2 px) { return texture2D(tNormal, px / uRes).a; }
/** linear view depth in world units (uFar on the background) */
float depthAt(vec2 px) {
  float d = texture2D(tDepth, px / uRes).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
/** coordinate used by wipes: 0 at the left edge → 1 at the right, slightly diagonal */
float wipeCoord(vec2 px) { return (px.x / uRes.x) * 0.84 + (1.0 - px.y / uRes.y) * 0.16; }
`,C=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,w=`
void main() {
  vec2 px = gl_FragCoord.xy;
  float e = wipeCoord(px);
  if (e < uClip.x || e >= uClip.y) discard;
  gl_FragColor = vec4(stylize(px), 1.0);
}
`,T=()=>({frag:`vec3 stylize(vec2 px) { return sceneAt(px); }`});function E(e,t){return new u({vertexShader:C,fragmentShader:S+`
`+e.frag+`
`+w,uniforms:{...t,...e.uniforms??{},uClip:{value:new v(-1,2)}},depthTest:!1,depthWrite:!1})}var D=(e,t)=>e===void 0?t:typeof e==`number`?e:e.get();function O({effect:e,prev:t,wipe:u,background:S=`#ffffff`,exposure:C,samples:w=4,onFrame:O,preload:k}){let A=p(e=>e.gl),j=p(e=>e.scene),M=p(e=>e.camera),N=(0,x.useMemo)(()=>{let e=e=>{let t=new c(2,2,{type:m,samples:w,depthBuffer:!0});return e&&(t.depthTexture=new l(2,2,f)),t},t={tScene:{value:null},tNormal:{value:null},tDepth:{value:null},uRes:{value:new v(1,1)},uSceneRes:{value:new v(1,1)},uDpr:{value:1},uTime:{value:0},uNear:{value:.1},uFar:{value:100},uOrtho:{value:0},uExposure:{value:1}},u=new r(new Uint8Array([128,128,255,0]),1,1);u.needsUpdate=!0;let p=new i;p.setAttribute(`position`,new n([-1,-1,0,3,-1,0,-1,3,0],3)),p.setAttribute(`uv`,new n([0,0,2,0,0,2],2));let h=new y(p);h.frustumCulled=!1;let g=new d;return g.add(h),{color:e(!0),colorPrev:null,normal:null,makeTarget:e,normalMat:new a,shared:t,blank:u,geo:p,quad:h,post:g,cam:new s(-1,1,1,-1,0,1),mats:new Map,fallback:T(),ready:new Set,compiling:new Map,waited:new Set,reveal:new Map,buf:new v,bgA:new o,bgB:new o,clear:new o,t:0}},[w]);(0,x.useEffect)(()=>()=>{N.color.dispose(),N.colorPrev?.dispose(),N.normal?.dispose(),N.normalMat.dispose(),N.blank.dispose(),N.geo.dispose(),N.mats.forEach(e=>e.dispose())},[N]);let P=e=>{let t=N.mats.get(e);return t||(t=E(e,N.shared),N.mats.set(e,t)),t},F=e=>{if(N.ready.has(e))return Promise.resolve();let t=N.compiling.get(e);if(!t){let n=P(e),r=N.quad.material;N.quad.material=n;let i=A.getRenderTarget();A.setRenderTarget(null),t=A.compileAsync(N.post,N.cam).catch(()=>{}).then(()=>{N.compiling.delete(e),N.mats.get(e)===n&&N.ready.add(e)}),A.setRenderTarget(i),N.quad.material=r,N.compiling.set(e,t)}return t},I=e=>N.ready.has(e)?!0:(F(e),!1),L=(0,x.useRef)(new Set);return L.current=new Set([N.fallback,e,...t?[t]:[],...k??[]]),(0,x.useEffect)(()=>{if(!k?.length)return;let e=!1;return(async()=>{for(let t of k){if(e)return;N.ready.has(t)||(await F(t),await new Promise(e=>setTimeout(e,120)))}})(),()=>{e=!0}},[k,N,A]),_((n,r)=>{let i=Math.min(r,1/20);N.t+=i;let a=N.shared,o=e.normals||t?.normals,s=Math.max(e.scale??1,t?.scale??0),c=(e.filter??t?.filter)===`nearest`;A.getDrawingBufferSize(N.buf);let l=Math.max(2,Math.round(N.buf.x*s)),d=Math.max(2,Math.round(N.buf.y*s));for(let e of[N.color,N.colorPrev,N.normal]){if(!e)continue;(e.width!==l||e.height!==d)&&e.setSize(l,d);let t=c?h:g;e.texture.magFilter!==t&&(e.texture.magFilter=t,e.texture.minFilter=t,e.texture.needsUpdate=!0)}let f=A.getClearColor(N.clear),p=A.getClearAlpha(),m=N.bgA.set(N.ready.has(e)?e.background??S:e.previewBackground??S);A.setRenderTarget(N.color),A.setClearColor(m,1),A.clear(!0,!0,!1),A.render(j,M);let _=b.clamp(D(u,1),0,1),v=N.color;if(t&&_<1){let e=N.bgB.set(t.background??S);e.getHex()!==m.getHex()&&(N.colorPrev||(N.colorPrev=N.makeTarget(!0),N.colorPrev.setSize(l,d)),A.setRenderTarget(N.colorPrev),A.setClearColor(e,1),A.clear(!0,!0,!1),A.render(j,M),v=N.colorPrev)}if(o){N.normal||(N.normal=N.makeTarget(!1),N.normal.setSize(l,d));let e=j.background;j.background=null,j.overrideMaterial=N.normalMat,A.setRenderTarget(N.normal),A.setClearColor(8421631,0),A.clear(!0,!0,!1),A.render(j,M),j.overrideMaterial=null,j.background=e}let y=M;a.tScene.value=N.color.texture,a.tDepth.value=N.color.depthTexture,a.tNormal.value=o&&N.normal?N.normal.texture:N.blank,a.uRes.value.copy(N.buf),a.uSceneRes.value.set(l,d),a.uDpr.value=A.getPixelRatio(),a.uTime.value=N.t,a.uNear.value=y.near,a.uFar.value=y.far,a.uOrtho.value=+!!y.isOrthographicCamera,a.uExposure.value=D(C,1);let x={dpr:A.getPixelRatio(),width:N.buf.x,height:N.buf.y},w=I(e),T=!t||I(t);w||N.waited.add(e),t&&!T&&N.waited.add(t),w&&e.update?.(i,x),t&&t!==e&&T&&t.update?.(i,x),O?.(i),A.setRenderTarget(null),A.setClearColor(m,1),A.clear(!0,!0,!1);let E=b.clamp(D(u,1),0,1),k=A.autoClear;A.autoClear=!1;let F=(e,t,n,r=N.color)=>{a.tScene.value=r.texture,a.tDepth.value=r.depthTexture;let i=P(e);i.uniforms.uClip.value.set(t,n),N.quad.material=i,A.render(N.post,N.cam)},R=w?e:N.fallback;if(t&&E<1)F(T?t:N.fallback,E,2,v),E>0&&F(R,-1,E);else if(w&&N.waited.has(e)){let t=Math.min(1,(N.reveal.get(e)??0)+i/.9);N.reveal.set(e,t);let n=t<.5?4*t*t*t:1-(-2*t+2)**3/2;t>=1?(N.waited.delete(e),N.reveal.delete(e),F(e,-1,2)):(F(N.fallback,n,2),n>0&&F(e,-1,n))}else F(R,-1,2);A.autoClear=k,A.setClearColor(f,p),N.mats.forEach((e,t)=>{!L.current.has(t)&&!N.compiling.has(t)&&(e.dispose(),N.mats.delete(t),N.ready.delete(t),N.waited.delete(t))})},1),null}export{T as n,O as t};