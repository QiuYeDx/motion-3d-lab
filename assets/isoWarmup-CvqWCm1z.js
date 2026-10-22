import{a as e,n as t}from"./jsx-runtime-D3jfb0Ew.js";import{Lt as n,P as r,Xt as i,h as a,ot as o,u as s}from"./events-9ce18a08.esm-BJiOHOtz.js";var c=e(t(),1);function l(e){let t=a(e=>e.gl),n=a(e=>e.scene),r=a(e=>e.camera),i=(0,c.useRef)(!1),o=(0,c.useRef)(e);return o.current=e,(0,c.useEffect)(()=>{let e=!1,a=requestAnimationFrame(()=>{if(e)return;let a=t.getRenderTarget();t.setRenderTarget(null);let s=t.compileAsync(n,r);t.setRenderTarget(a),s.catch(()=>{}).then(()=>{e||(i.current=!0,o.current?.())})});return()=>{e=!0,cancelAnimationFrame(a)}},[t,n,r]),s(()=>{i.current?t.render(n,r):(t.setRenderTarget(null),t.clear(!0,!0,!1))},1),i}var u=`
uniform float uSize;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vUv = uv;
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = vec3(1.0);
  #endif
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(instanceMatrix[0].xyz) * length(modelMatrix[0].xyz);
  c.xy += position.xy * uSize * s;
  gl_Position = projectionMatrix * c;
}`,d=`
uniform float uIntensity;
uniform vec3 uTint;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = exp(-d * d * 5.5) * (1.0 - smoothstep(0.85, 1.0, d));
  float core = exp(-d * d * 40.0);
  vec3 col = vCol * uTint * (a + core * 0.9) * uIntensity;
  gl_FragColor = vec4(col, 1.0);
}`;function f(e=1){return new i({uniforms:{uSize:{value:e},uIntensity:{value:0},uTint:{value:new r(1,1,1)}},vertexShader:u,fragmentShader:d,transparent:!0,depthWrite:!1,depthTest:!0,toneMapped:!1,blending:5,blendEquation:100,blendSrc:201,blendDst:201,blendSrcAlpha:200,blendDstAlpha:201})}var p=new n(1,1),m=`
attribute float aAlpha;
varying vec2 vUv;
varying float vA;
varying vec3 vCol;
void main() {
  vUv = uv;
  vA = aAlpha;
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = vec3(1.0);
  #endif
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(instanceMatrix[0].xyz) * length(modelMatrix[0].xyz);
  c.xy += position.xy * s;
  gl_Position = projectionMatrix * c;
}`,h=`
uniform vec3 uColor;
uniform float uOpacity;
uniform float uSoft;
varying vec2 vUv;
varying float vA;
varying vec3 vCol;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(1.0 - uSoft, 1.0, d)) * vA * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * uColor, a);
  #include <colorspace_fragment>
}`;function g(e=`#ffffff`,t=.6){return new i({uniforms:{uColor:{value:new r(e)},uOpacity:{value:1},uSoft:{value:t}},vertexShader:m,fragmentShader:h,transparent:!0,depthWrite:!1})}function _(e){let t=p.clone();return t.setAttribute(`aAlpha`,new o(new Float32Array(e),1)),t}export{l as a,p as i,g as n,f as r,_ as t};