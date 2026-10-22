import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{n as a,r as o}from"./index-gQ65n0JU.js";import{Jt as s,P as c,Sn as l,W as u,Xt as d,et as f,h as p,it as m,k as h,kt as g,mn as _,pn as v,pt as y,s as b,u as x,vn as S,xt as C,yn as w}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as T}from"./react-three-fiber.esm-zWEOtJjG.js";import{t as E}from"./Seg-CH5KfWEm.js";import{t as D}from"./extends-CvVTau-c.js";import{n as O,t as k}from"./Lightformer-DFdpx6x6.js";import{t as A}from"./RoundedBox-DrdXcTlF.js";function j(e,t,n,r){var i=class extends d{constructor(i){super({vertexShader:t,fragmentShader:n,...i});for(let t in e)this.uniforms[t]=new v(e[t]),Object.defineProperty(this,t,{get(){return this.uniforms[t].value},set(e){this.uniforms[t].value=e}});this.uniforms=_.clone(this.uniforms),r?.(this)}};return i.key=C.generateUUID(),i}var M=e(t());function N(e,t,n){let r=p(e=>e.size),i=p(e=>e.viewport),a=typeof e==`number`?e:r.width*i.dpr,o=typeof t==`number`?t:r.height*i.dpr,s=(typeof e==`number`?n:e)||{},{samples:c=0,depth:d,...h}=s,g=d??s.depthBuffer,_=M.useMemo(()=>{let e=new l(a,o,{minFilter:y,magFilter:y,type:m,...h});return g&&(e.depthTexture=new u(a,o,f)),e.samples=c,e},[]);return M.useLayoutEffect(()=>{_.setSize(a,o),c&&(_.samples=c)},[c,_,a,o]),M.useEffect(()=>()=>_.dispose(),[]),_}var P=j({},`void main() { }`,`void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); discard;  }`),F=class extends g{constructor(e=6,t=!1){super(),this.uniforms={chromaticAberration:{value:.05},transmission:{value:0},_transmission:{value:1},transmissionMap:{value:null},roughness:{value:0},thickness:{value:0},thicknessMap:{value:null},attenuationDistance:{value:1/0},attenuationColor:{value:new c(`white`)},anisotropicBlur:{value:.1},time:{value:0},distortion:{value:0},distortionScale:{value:.5},temporalDistortion:{value:0},buffer:{value:null}},this.onBeforeCompile=n=>{n.uniforms={...n.uniforms,...this.uniforms},(this.anisotropy??0)>0&&(n.defines.USE_ANISOTROPY=``),t?n.defines.USE_SAMPLER=``:n.defines.USE_TRANSMISSION=``,n.fragmentShader=`
      uniform float chromaticAberration;         
      uniform float anisotropicBlur;      
      uniform float time;
      uniform float distortion;
      uniform float distortionScale;
      uniform float temporalDistortion;
      uniform sampler2D buffer;

      vec3 random3(vec3 c) {
        float j = 4096.0*sin(dot(c,vec3(17.0, 59.4, 15.0)));
        vec3 r;
        r.z = fract(512.0*j);
        j *= .125;
        r.x = fract(512.0*j);
        j *= .125;
        r.y = fract(512.0*j);
        return r-0.5;
      }

      uint hash( uint x ) {
        x += ( x << 10u );
        x ^= ( x >>  6u );
        x += ( x <<  3u );
        x ^= ( x >> 11u );
        x += ( x << 15u );
        return x;
      }

      // Compound versions of the hashing algorithm I whipped together.
      uint hash( uvec2 v ) { return hash( v.x ^ hash(v.y)                         ); }
      uint hash( uvec3 v ) { return hash( v.x ^ hash(v.y) ^ hash(v.z)             ); }
      uint hash( uvec4 v ) { return hash( v.x ^ hash(v.y) ^ hash(v.z) ^ hash(v.w) ); }

      // Construct a float with half-open range [0:1] using low 23 bits.
      // All zeroes yields 0.0, all ones yields the next smallest representable value below 1.0.
      float floatConstruct( uint m ) {
        const uint ieeeMantissa = 0x007FFFFFu; // binary32 mantissa bitmask
        const uint ieeeOne      = 0x3F800000u; // 1.0 in IEEE binary32
        m &= ieeeMantissa;                     // Keep only mantissa bits (fractional part)
        m |= ieeeOne;                          // Add fractional part to 1.0
        float  f = uintBitsToFloat( m );       // Range [1:2]
        return f - 1.0;                        // Range [0:1]
      }

      // Pseudo-random value in half-open range [0:1].
      float randomBase( float x ) { return floatConstruct(hash(floatBitsToUint(x))); }
      float randomBase( vec2  v ) { return floatConstruct(hash(floatBitsToUint(v))); }
      float randomBase( vec3  v ) { return floatConstruct(hash(floatBitsToUint(v))); }
      float randomBase( vec4  v ) { return floatConstruct(hash(floatBitsToUint(v))); }
      float rand(float seed) {
        float result = randomBase(vec3(gl_FragCoord.xy, seed));
        return result;
      }

      const float F3 =  0.3333333;
      const float G3 =  0.1666667;

      float snoise(vec3 p) {
        vec3 s = floor(p + dot(p, vec3(F3)));
        vec3 x = p - s + dot(s, vec3(G3));
        vec3 e = step(vec3(0.0), x - x.yzx);
        vec3 i1 = e*(1.0 - e.zxy);
        vec3 i2 = 1.0 - e.zxy*(1.0 - e);
        vec3 x1 = x - i1 + G3;
        vec3 x2 = x - i2 + 2.0*G3;
        vec3 x3 = x - 1.0 + 3.0*G3;
        vec4 w, d;
        w.x = dot(x, x);
        w.y = dot(x1, x1);
        w.z = dot(x2, x2);
        w.w = dot(x3, x3);
        w = max(0.6 - w, 0.0);
        d.x = dot(random3(s), x);
        d.y = dot(random3(s + i1), x1);
        d.z = dot(random3(s + i2), x2);
        d.w = dot(random3(s + 1.0), x3);
        w *= w;
        w *= w;
        d *= w;
        return dot(d, vec4(52.0));
      }

      float snoiseFractal(vec3 m) {
        return 0.5333333* snoise(m)
              +0.2666667* snoise(2.0*m)
              +0.1333333* snoise(4.0*m)
              +0.0666667* snoise(8.0*m);
      }
`+n.fragmentShader,n.fragmentShader=n.fragmentShader.replace(`#include <transmission_pars_fragment>`,`
        #ifdef USE_TRANSMISSION
          // Transmission code is based on glTF-Sampler-Viewer
          // https://github.com/KhronosGroup/glTF-Sample-Viewer
          uniform float _transmission;
          uniform float thickness;
          uniform float attenuationDistance;
          uniform vec3 attenuationColor;
          #ifdef USE_TRANSMISSIONMAP
            uniform sampler2D transmissionMap;
          #endif
          #ifdef USE_THICKNESSMAP
            uniform sampler2D thicknessMap;
          #endif
          uniform vec2 transmissionSamplerSize;
          uniform sampler2D transmissionSamplerMap;
          uniform mat4 modelMatrix;
          uniform mat4 projectionMatrix;
          varying vec3 vWorldPosition;
          vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in vec3 modelScale ) {
            // Direction of refracted light.
            // n is normalized once when the sample normal is built.
            vec3 refractionVector = refract( - v, n, 1.0 / ior );
            // The thickness is specified in local space.
            return normalize( refractionVector ) * thickness * modelScale;
          }
          float applyIorToRoughness( const in float roughness, const in float ior ) {
            // Scale roughness with IOR so that an IOR of 1.0 results in no microfacet refraction and
            // an IOR of 1.5 results in the default amount of microfacet refraction.
            return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
          }
          vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
            float framebufferLod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );            
            #ifdef USE_SAMPLER
              #ifdef texture2DLodEXT
                return texture2DLodEXT(transmissionSamplerMap, fragCoord.xy, framebufferLod);
              #else
                return texture2D(transmissionSamplerMap, fragCoord.xy, framebufferLod);
              #endif
            #else
              return texture2D(buffer, fragCoord.xy);
            #endif
          }
          vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
            const in vec3 position, const in vec3 modelScale, const in vec3 attenuationCoefficient, const in vec3 F,
            const in mat4 viewMatrix, const in mat4 projMatrix, const in float ior, const in float thickness,
            const in float attenuationDistance ) {
            vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelScale );
            vec3 refractedRayExit = position + transmissionRay;
            // Project refracted vector on the framebuffer, while mapping to normalized device coordinates.
            vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
            vec2 refractionCoords = ndcPos.xy / ndcPos.w;
            refractionCoords += 1.0;
            refractionCoords /= 2.0;
            // Sample framebuffer to get pixel the refracted ray hits.
            vec4 transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
            vec3 attenuatedColor = transmittedLight.rgb;
            if ( !isinf( attenuationDistance ) ) {
              // Apply Beer's law.
              attenuatedColor *= exp( - attenuationCoefficient * length( transmissionRay ) );
            }
            return vec4( ( 1.0 - F ) * attenuatedColor * diffuseColor, transmittedLight.a );
          }
        #endif
`),n.fragmentShader=n.fragmentShader.replace(`#include <transmission_fragment>`,`  
        // Improve the refraction to use the world pos
        material.transmission = _transmission;
        material.transmissionAlpha = 1.0;
        material.thickness = thickness;
        material.attenuationDistance = attenuationDistance;
        material.attenuationColor = attenuationColor;
        #ifdef USE_TRANSMISSIONMAP
          material.transmission *= texture2D( transmissionMap, vUv ).r;
        #endif
        #ifdef USE_THICKNESSMAP
          material.thickness *= texture2D( thicknessMap, vUv ).g;
        #endif
        
        if (material.transmission != 0.0) {
          vec3 pos = vWorldPosition;
          float runningSeed = 0.0;
          vec3 v = normalize( cameraPosition - pos );
          vec3 n = inverseTransformDirection( normal, viewMatrix );
          vec3 transmission = vec3(0.0);
          float randomCoords = rand(runningSeed++);
          float thickness_smear = thickness * max(pow(roughnessFactor, 0.33), anisotropicBlur);
          vec3 distortionNormal = vec3(0.0);
          vec3 temporalOffset = vec3(time, -time, -time) * temporalDistortion;

          vec3 modelScale = vec3(
            length( vec3( modelMatrix[ 0 ].xyz ) ),
            length( vec3( modelMatrix[ 1 ].xyz ) ),
            length( vec3( modelMatrix[ 2 ].xyz ) )
          );

          // Beer's-law coefficient
          vec3 attenuationCoefficient = vec3(0.0);
          if ( !isinf( material.attenuationDistance ) ) {
            attenuationCoefficient = -log( material.attenuationColor ) / material.attenuationDistance;
          }

          if (distortion > 0.0) {
            distortionNormal = distortion * vec3(snoiseFractal(vec3((pos * distortionScale + temporalOffset))), snoiseFractal(vec3(pos.zxy * distortionScale - temporalOffset)), snoiseFractal(vec3(pos.yxz * distortionScale + temporalOffset)));
          }
          for (float i = 0.0; i < ${e}.0; i ++) {
            vec3 sampleNorm;
            if (roughnessFactor > 0.0) {
              sampleNorm = normalize(n + roughnessFactor * roughnessFactor * 2.0 * normalize(vec3(rand(runningSeed++) - 0.5, rand(runningSeed++) - 0.5, rand(runningSeed++) - 0.5)) * pow(rand(runningSeed++), 0.33) + distortionNormal);
            } else {
              // Smooth surfaces skip four hashes, a pow, and a normalization per sample
              sampleNorm = normalize(n + distortionNormal);
            }
            float sampleProgress = (i + randomCoords) / float(${e});
            float sampleThickness = material.thickness + thickness_smear * sampleProgress;
            // Fresnel is identical for RGB; only the refracted IOR changes.
            vec3 F = EnvironmentBRDF( sampleNorm, v, material.specularColor, material.specularF90, material.roughness );
            if (chromaticAberration == 0.0) {
              // With one IOR, a single framebuffer sample supplies all RGB channels
              transmission += getIBLVolumeRefraction(
                sampleNorm, v, material.roughness, material.diffuseColor, pos, modelScale, attenuationCoefficient, F,
                viewMatrix, projectionMatrix, material.ior, sampleThickness, material.attenuationDistance
              ).rgb;
            } else {
              float aberration = chromaticAberration * sampleProgress;
              transmission.r += getIBLVolumeRefraction(
                sampleNorm, v, material.roughness, material.diffuseColor, pos, modelScale, attenuationCoefficient, F,
                viewMatrix, projectionMatrix, material.ior, sampleThickness, material.attenuationDistance
              ).r;
              transmission.g += getIBLVolumeRefraction(
                sampleNorm, v, material.roughness, material.diffuseColor, pos, modelScale, attenuationCoefficient, F,
                viewMatrix, projectionMatrix, material.ior * (1.0 + aberration), sampleThickness, material.attenuationDistance
              ).g;
              transmission.b += getIBLVolumeRefraction(
                sampleNorm, v, material.roughness, material.diffuseColor, pos, modelScale, attenuationCoefficient, F,
                viewMatrix, projectionMatrix, material.ior * (1.0 + 2.0 * aberration), sampleThickness, material.attenuationDistance
              ).b;
            }
          }
          transmission /= ${e}.0;
          totalDiffuse = mix( totalDiffuse, transmission, material.transmission );
        }\n`)},Object.keys(this.uniforms).forEach(e=>Object.defineProperty(this,e,{get:()=>this.uniforms[e].value,set:t=>this.uniforms[e].value=t}))}},I=M.forwardRef(({buffer:e,transmissionSampler:t=!1,backside:n=!1,side:r=0,transmission:i=1,thickness:a=0,backsideThickness:o=0,backsideEnvMapIntensity:s=1,samples:c=10,resolution:l,backsideResolution:u,background:d,anisotropy:f,anisotropicBlur:p,...m},h)=>{b({MeshTransmissionMaterial:F});let g=M.useRef(null),[_]=M.useState(()=>new P),v=u??l,y=N(v,v),S=N(l,l),C,w,T,E;return x(e=>{let i=g.current;if(i.uniforms.time.value=e.clock.elapsedTime,i.uniforms.buffer.value===S.texture&&!t){var c;E=(c=i.__r3f)==null||(c=c.parent)==null?void 0:c.object,E&&i.visible&&i.uniforms._transmission.value!==0&&(T=e.gl.toneMapping,C=e.scene.background,w=i.envMapIntensity,e.gl.toneMapping=0,d&&(e.scene.background=d),E.material=_,n&&(e.gl.setRenderTarget(y),e.gl.render(e.scene,e.camera),E.material=i,i.uniforms.buffer.value=y.texture,i.uniforms.thickness.value=o,i.side=1,r!==1&&(i.needsUpdate=!0),i.envMapIntensity=s),e.gl.setRenderTarget(S),e.gl.render(e.scene,e.camera),E.material=i,i.uniforms.thickness.value=a,i.side=r,n&&r!==1&&(i.needsUpdate=!0),i.uniforms.buffer.value=S.texture,i.envMapIntensity=w,e.scene.background=C,e.gl.setRenderTarget(null),e.gl.toneMapping=T)}}),M.useImperativeHandle(h,()=>g.current,[]),M.createElement(`meshTransmissionMaterial`,D({args:[c,t],ref:g},m,{buffer:e||S.texture,_transmission:i,anisotropicBlur:p??f,transmission:t?i:0,thickness:a,side:r}))}),L=M.forwardRef(({children:e,enabled:t=!0,speed:n=1,rotationIntensity:r=1,floatIntensity:i=1,floatingRange:a=[-.1,.1],autoInvalidate:o=!1,...s},c)=>{let l=M.useRef(null);M.useImperativeHandle(c,()=>l.current,[]);let u=M.useRef(Math.random()*1e4);return x(e=>{if(!t||n===0)return;o&&e.invalidate();let s=u.current+e.clock.elapsedTime;l.current.rotation.x=Math.cos(s/4*n)/8*r,l.current.rotation.y=Math.sin(s/4*n)/8*r,l.current.rotation.z=Math.sin(s/4*n)/20*r;let c=Math.sin(s/4*n)/10;c=C.mapLinear(c,-.1,.1,a?.[0]??-.1,a?.[1]??.1),l.current.position.y=c*i,l.current.updateMatrix()}),M.createElement(`group`,s,M.createElement(`group`,{ref:l,matrixAutoUpdate:!1},e))}),R=n(),z=[{key:`clear`,zh:`清透`,en:`Clear`,desc:`低粗糙度与轻微色散，标题在玻璃里被放大、翻转和折弯。`,m:{frost:0,thickness:.9,roughness:0,chroma:.06,aniso:0,ior:1.5,distortion:0,dScale:.3,tDist:0}},{key:`frost`,zh:`磨砂`,en:`Frosted`,desc:`折射源换成预模糊的背景，再叠一点粗糙度，像喷砂玻璃。`,m:{frost:1,thickness:1.4,roughness:.08,chroma:.04,aniso:.05,ior:1.3,distortion:.05,dScale:.3,tDist:0}},{key:`prism`,zh:`色散`,en:`Dispersion`,desc:`RGB 三通道按不同折射率采样，边缘拆出彩虹并轻微流动。`,m:{frost:0,thickness:1.8,roughness:.03,chroma:1.1,aniso:.4,ior:1.75,distortion:.35,dScale:.45,tDist:.12}}],B=Object.keys(z[0].m),V=typeof window<`u`&&window.innerWidth<760,H=`"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif`,U=`"JetBrains Mono", "Cascadia Code", Consolas, monospace`;function W(e,t,n){let r=document.createElement(`canvas`);r.width=Math.round(e*n),r.height=Math.round(t*n);let i=r.getContext(`2d`);i.scale(n,n);let a=e<760,o=i.createLinearGradient(0,0,0,t);o.addColorStop(0,`#f1f2f6`),o.addColorStop(1,`#e6e8ef`),i.fillStyle=o,i.fillRect(0,0,e,t);let c=(n,r,a,o)=>{let s=i.createRadialGradient(n,r,0,n,r,a);s.addColorStop(0,o),s.addColorStop(1,`rgba(255,255,255,0)`),i.fillStyle=s,i.fillRect(0,0,e,t)};c(e*.74,t*.3,Math.max(e,t)*.38,`rgba(122,140,255,0.32)`),c(e*.22,t*.78,Math.max(e,t)*.34,`rgba(255,143,112,0.22)`);let l=a?36:48;i.strokeStyle=`rgba(29,28,26,0.055)`,i.lineWidth=1,i.beginPath();for(let n=e/2%l+.5;n<e;n+=l)i.moveTo(n,0),i.lineTo(n,t);for(let n=t/2%l+.5;n<t;n+=l)i.moveTo(0,n),i.lineTo(e,n);i.stroke();let u=a?Math.min(e*.215,t*.12):Math.min(e*.165,t*.27),d=a?t*.43:t*.47;i.fillStyle=`#16171c`,i.textAlign=`left`,i.textBaseline=`middle`,i.font=`700 ${u}px ${H}`,i.letterSpacing=`${-u*.04}px`;let f=e/2-u*1.92;i.fillText(`透明，`,f,d-u*.56),i.fillText(`也有厚度`,f,d+u*.56),i.textAlign=`center`,i.letterSpacing=`2px`,i.font=`500 ${a?10:12}px ${U}`,i.fillStyle=`rgba(29,28,26,0.5)`,i.fillText(a?`IOR · THICKNESS · DISPERSION`:`MESH TRANSMISSION · IOR · THICKNESS · CHROMATIC ABERRATION`,e/2,d+u*1.32);let p=new h(r);p.colorSpace=s,p.anisotropy=4;let m=Math.max(32,Math.round(e/3)),g=Math.max(32,Math.round(t/3)),_=document.createElement(`canvas`);_.width=m,_.height=g;let v=_.getContext(`2d`);typeof v.filter==`string`?(v.filter=`blur(${Math.round(m/70)}px)`,v.drawImage(r,-m*.05,-g*.05,m*1.1,g*1.1)):(v.drawImage(r,0,0,m/8,g/8),v.drawImage(_,0,0,m/8,g/8,0,0,m,g));let y=new h(_);return y.colorSpace=s,{tex:p,blur:y}}function G({z:e,frostRef:t}){let{size:n,camera:r}=p(),i=Math.min(window.devicePixelRatio||1,2),{tex:a,blur:o}=(0,M.useMemo)(()=>W(n.width,n.height,i),[n.width,n.height,i]);(0,M.useEffect)(()=>()=>{a.dispose(),o.dispose()},[a,o]);let s=r,c=2*(s.position.z-e)*Math.tan(C.degToRad(s.fov/2));return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsxs)(`mesh`,{position:[0,0,e],children:[(0,R.jsx)(`planeGeometry`,{args:[c*(n.width/n.height),c]}),(0,R.jsx)(`meshBasicMaterial`,{map:a,toneMapped:!1})]}),(0,R.jsxs)(`mesh`,{ref:t,position:[0,0,e+.01],visible:!1,children:[(0,R.jsx)(`planeGeometry`,{args:[c*(n.width/n.height),c]}),(0,R.jsx)(`meshBasicMaterial`,{map:o,toneMapped:!1,transparent:!0,opacity:0,depthWrite:!1})]})]})}var K=[{kind:`torus`,p:[-.56,.3,.6],pm:[.42,.6,.4],s:1,rot:[.6,.3,0],speed:.9},{kind:`box`,p:[.6,.46,-.2],pm:[-.48,.52,-.2],s:1,rot:[.5,.7,.2],speed:1.1},{kind:`sphere`,p:[.08,-.16,1.4],pm:[.12,.08,1.2],s:1,rot:[0,0,0],speed:1.3},{kind:`cone`,p:[-.2,-.56,.2],pm:[-.42,-.36,.2],s:1,rot:[.3,0,.5],speed:1},{kind:`ico`,p:[.68,-.42,.5],pm:[.44,-.46,.4],s:1,rot:[.2,.4,0],speed:.8}];function q({kind:e}){switch(e){case`torus`:return(0,R.jsx)(`torusGeometry`,{args:[.62,.27,48,128]});case`sphere`:return(0,R.jsx)(`sphereGeometry`,{args:[.66,96,64]});case`cone`:return(0,R.jsx)(`coneGeometry`,{args:[.62,1.15,96,1]});case`ico`:return(0,R.jsx)(`icosahedronGeometry`,{args:[.72,0]});default:return null}}function J({cfg:e,i:t,buffer:n,mats:a,pointer:o}){let{viewport:s,size:c}=p(),l=c.width<760,u=(0,M.useRef)(null),d=(0,M.useRef)(null),f=i(0),m=i(1),h=s.getCurrentViewport(void 0,new w(0,0,0)),g=l?e.pm:e.p,_=(0,M.useMemo)(()=>new w(g[0]*h.width*.5,g[1]*h.height*.5,g[2]),[g,h.width,h.height]),v=l?.62:Math.min(1.15,Math.max(.8,h.width/8.6)),y=.25+g[2]*.25,b=t%2?-1:1;x((t,n)=>{n=Math.min(n,1/30);let r=u.current,i=d.current;if(!r||!i)return;let a=o.current;r.position.x=C.damp(r.position.x,_.x+a.x*y*.6,3,n),r.position.y=C.damp(r.position.y,_.y+a.y*y*.4,3,n),r.position.z=_.z,i.rotation.x+=n*.12*e.speed*b,i.rotation.y+=n*.22*e.speed,i.rotation.z=e.rot[2]+f.get()*.25,r.rotation.y=f.get()+a.x*.35,r.rotation.x=-a.y*.25,r.scale.setScalar(v*m.get())});let S=e=>{e.stopPropagation(),r(f,f.get()+Math.PI*2,{type:`spring`,stiffness:42,damping:9}),r(m,[1.14,1],{duration:.6,ease:[.23,1,.32,1]})},T=(0,R.jsx)(I,{ref:e=>{e&&(a.current[t]=e)},buffer:n,resolution:16,backsideResolution:16,samples:V?5:10,transmission:1,thickness:.9,roughness:.02,chromaticAberration:.06,anisotropy:.1,anisotropicBlur:.1,ior:1.5,distortion:0,distortionScale:.3,temporalDistortion:0,color:`#ffffff`,attenuationColor:`#eef0ff`,attenuationDistance:2.5,envMapIntensity:.9});return(0,R.jsx)(`group`,{ref:u,children:(0,R.jsx)(L,{speed:e.speed*1.4,rotationIntensity:.35,floatIntensity:.7,floatingRange:[-.12,.12],children:(0,R.jsx)(`group`,{ref:d,rotation:e.rot,children:e.kind===`box`?(0,R.jsx)(A,{args:[1.05,1.05,1.05],radius:.16,smoothness:6,onClick:S,onPointerOver:()=>{document.body.style.cursor=`pointer`,r(m,1.06,{type:`spring`,stiffness:300,damping:20})},onPointerOut:()=>{document.body.style.cursor=``,r(m,1,{type:`spring`,stiffness:300,damping:20})},children:T}):(0,R.jsxs)(`mesh`,{onClick:S,onPointerOver:()=>{document.body.style.cursor=`pointer`,r(m,1.06,{type:`spring`,stiffness:300,damping:20})},onPointerOut:()=>{document.body.style.cursor=``,r(m,1,{type:`spring`,stiffness:300,damping:20})},children:[(0,R.jsx)(q,{kind:e.kind}),T]})})})})}function Y({mix:e,from:t,to:n}){let{size:r,viewport:i}=p(),a=V?.75:.85,o=N(Math.round(r.width*i.dpr*a),Math.round(r.height*i.dpr*a),{samples:0}),s=(0,M.useRef)(null),c=(0,M.useRef)([]),l=(0,M.useRef)(new S),u=(0,M.useMemo)(()=>({...z[0].m}),[]),d=(0,M.useRef)(null);return(0,M.useEffect)(()=>{let e=e=>l.current.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1));return window.addEventListener(`pointermove`,e),()=>{window.removeEventListener(`pointermove`,e),document.body.style.cursor=``}},[]),x(r=>{let i=e.get();for(let e of B)u[e]=t.current[e]+(n.current[e]-t.current[e])*i;for(let e of c.current)e&&(e.thickness=u.thickness,e.roughness=u.roughness,e.chromaticAberration=u.chroma,e.anisotropicBlur=u.aniso,e.ior=u.ior,e.distortion=u.distortion,e.distortionScale=u.dScale,e.temporalDistortion=u.tDist);let a=s.current;if(!a)return;let{gl:l,scene:f,camera:p}=r,m=l.toneMapping,h=d.current;h&&(h.material.opacity=u.frost,h.visible=u.frost>.001),a.visible=!1,l.toneMapping=0,l.setRenderTarget(o),l.render(f,p),l.setRenderTarget(null),l.toneMapping=m,a.visible=!0,h&&(h.visible=!1)}),(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(G,{z:-2.5,frostRef:d}),(0,R.jsx)(`group`,{ref:s,children:K.map((e,t)=>(0,R.jsx)(J,{cfg:e,i:t,buffer:o.texture,mats:c,pointer:l},e.kind))}),(0,R.jsxs)(O,{resolution:256,frames:1,children:[(0,R.jsx)(`color`,{attach:`background`,args:[`#14151a`]}),(0,R.jsx)(k,{form:`rect`,intensity:2.4,color:`#ffffff`,position:[0,6,1],"rotation-x":Math.PI/2,scale:[8,1.2,1]}),(0,R.jsx)(k,{form:`rect`,intensity:1.6,color:`#ffffff`,position:[-6,1,2],"rotation-y":Math.PI/2,scale:[1.2,6,1]}),(0,R.jsx)(k,{form:`rect`,intensity:1.2,color:`#aab6ff`,position:[6,0,1],"rotation-y":-Math.PI/2,scale:[2,5,1]}),(0,R.jsx)(k,{form:`ring`,intensity:2,color:`#ffd2c0`,position:[3,3,6],scale:1.6}),(0,R.jsx)(k,{form:`rect`,intensity:.25,color:`#ffffff`,position:[0,-6,0],"rotation-x":-Math.PI/2,scale:[10,10,1]})]})]})}function X(){let[e,t]=(0,M.useState)(0),n=i(1),s=(0,M.useRef)({...z[0].m}),c=(0,M.useRef)({...z[0].m}),l=(0,M.useRef)(!1);(0,M.useEffect)(()=>{let t=n.get(),i={...s.current};for(let e of B)i[e]=s.current[e]+(c.current[e]-s.current[e])*t;s.current=i,c.current={...z[e].m},n.set(0);let a=r(n,1,{duration:1.4,ease:[.45,0,.2,1]});return()=>a.stop()},[e,n]),(0,M.useEffect)(()=>{let e=setInterval(()=>{l.current||t(e=>(e+1)%z.length)},6e3);return()=>clearInterval(e)},[]);let u=z[e];return(0,R.jsxs)(`div`,{className:`stage`,style:{background:`#eceef3`},children:[(0,R.jsx)(`style`,{children:Z}),(0,R.jsx)(T,{dpr:[1,2],flat:!0,camera:{position:[0,0,9],fov:32},gl:{antialias:!0,alpha:!1},children:(0,R.jsx)(Y,{mix:n,from:s,to:c})}),(0,R.jsxs)(`div`,{className:`overlay`,children:[(0,R.jsxs)(`div`,{className:`gr-caption`,children:[(0,R.jsxs)(`p`,{className:`gr-meta`,children:[(0,R.jsx)(`i`,{}),` Glass · `,String(e+1).padStart(2,`0`),` / 03`]}),(0,R.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,R.jsxs)(a.div,{initial:{opacity:0,y:10,filter:`blur(6px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},exit:{opacity:0,y:-8,filter:`blur(6px)`},transition:{duration:.5,ease:[.23,1,.32,1]},children:[(0,R.jsxs)(`h2`,{children:[u.zh,(0,R.jsx)(`span`,{children:u.en})]}),(0,R.jsx)(`p`,{children:u.desc})]},u.key)})]}),(0,R.jsx)(`div`,{className:`dock`,children:(0,R.jsx)(E,{items:z.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:e=>{l.current=!0,t(e)}})}),(0,R.jsx)(`p`,{className:`hint`,children:`点击玻璃体 · 转一圈`})]})]})}var Z=`
.gr-caption {
  position: absolute; left: clamp(24px, 6vw, 96px); bottom: 32px; width: min(370px, calc(100% - 48px));
  pointer-events: none !important;
}
.gr-meta {
  display: inline-flex; align-items: center; gap: 8px; margin: 0 0 10px;
  font: 500 11.5px/1 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--fg-2);
}
.gr-meta i { width: 6px; height: 6px; border-radius: 50%; background: #7a8cff }
.gr-caption h2 { margin: 0; font: 600 22px/1.2 var(--display); letter-spacing: -.01em }
.gr-caption h2 span { margin-left: 10px; font: 400 13px var(--sans); color: var(--fg-2) }
.gr-caption p:not(.gr-meta) { margin: 6px 0 0; font-size: 13.5px; line-height: 1.65; color: var(--fg-2) }
@media (max-width: 1100px) { .gr-caption { display: none } }
`;export{X as default};