import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CX_WDEyT.js";import{t as i}from"./use-motion-value-CIZAIwyH.js";import{n as a,r as o}from"./index-uImfd-0P.js";import{Jt as s,M as c,T as l,Ut as u,_n as d,dt as f,h as p,pn as m,u as h,w as g,yt as _,z as v}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as y}from"./react-three-fiber.esm-BQtD7wyt.js";import{n as b}from"./iso-C377rVhz.js";import{t as x}from"./Seg-BfWvO_Xs.js";import{r as S,t as C}from"./dist-vKXJJnic.js";import{r as w}from"./glsl-CTWV-b_3.js";import{t as T}from"./BigLabel-Bg3FcBz2.js";import{t as E}from"./fit-CkWZ68TI.js";var D=e(t(),1),O=e=>440*2**((e-69)/12),k=[{root:33,notes:[57,60,64,67]},{root:29,notes:[53,57,60,64]},{root:36,notes:[55,59,60,64]},{root:31,notes:[55,59,62,64]}],A={2:12,6:12,10:12,11:24,14:12,15:19},j=[0,1,2,3,2,1,3,2],M=class{ctx;analyser;bpm=116;out;comp;music;drums;padDuck;padFilter;arpBus;lfo;noise;timer=0;step=0;nextTime=0;running=!1;compTap=!0;mic=null;micSrc=null;micGain;closed=!1;constructor(){let e=window.AudioContext||window.webkitAudioContext,t=this.ctx=new e({latencyHint:`interactive`}),n=this.analyser=t.createAnalyser();n.fftSize=2048,n.smoothingTimeConstant=.35,n.minDecibels=-78,n.maxDecibels=-14;let r=t.createGain();r.gain.value=0,n.connect(r).connect(t.destination),this.out=t.createGain(),this.out.gain.value=.8,this.out.connect(t.destination);let i=this.comp=t.createDynamicsCompressor();i.threshold.value=-14,i.knee.value=10,i.ratio.value=3.5,i.attack.value=.004,i.release.value=.18,i.connect(this.out),i.connect(n),this.music=t.createGain(),this.music.connect(i),this.drums=t.createGain(),this.drums.connect(this.music),this.padDuck=t.createGain(),this.padDuck.connect(this.music),this.padFilter=t.createBiquadFilter(),this.padFilter.type=`lowpass`,this.padFilter.frequency.value=1500,this.padFilter.Q.value=.8,this.padFilter.connect(this.padDuck),this.lfo=t.createOscillator(),this.lfo.frequency.value=.07;let a=t.createGain();a.gain.value=700,this.lfo.connect(a).connect(this.padFilter.frequency),this.lfo.start(),this.arpBus=t.createGain(),this.arpBus.gain.value=.7,this.arpBus.connect(this.music);let o=t.createDelay(1);o.delayTime.value=180/this.bpm/4;let s=t.createGain();s.gain.value=.4;let c=t.createBiquadFilter();c.type=`lowpass`,c.frequency.value=2800;let l=t.createGain();l.gain.value=.55,this.arpBus.connect(o),o.connect(c).connect(s).connect(o),c.connect(l).connect(this.music),this.micGain=t.createGain(),this.micGain.gain.value=2.2;let u=t.sampleRate;this.noise=t.createBuffer(1,u,t.sampleRate);let d=this.noise.getChannelData(0);for(let e=0;e<u;e++)d[e]=Math.random()*2-1}tick=()=>{let e=this.ctx;if(e.state!==`running`)return;this.nextTime<e.currentTime-.05&&(this.nextTime=e.currentTime+.03);let t=60/this.bpm/4;for(;this.nextTime<e.currentTime+.12;)this.stepAt(this.step,this.nextTime),this.nextTime+=t,this.step=(this.step+1)%64};startMusic(){this.running||this.closed||(this.running=!0,this.step=0,this.nextTime=this.ctx.currentTime+.06,this.timer=window.setInterval(this.tick,25),this.tick())}stopMusic(){this.running=!1,clearInterval(this.timer)}setMuted(e){this.out.gain.setTargetAtTime(e?0:.8,this.ctx.currentTime,.04)}useDemo(){this.stopMic(),this.compTap||=(this.comp.connect(this.analyser),!0),this.music.gain.cancelScheduledValues(this.ctx.currentTime),this.music.gain.setTargetAtTime(1,this.ctx.currentTime,.05),this.startMusic()}async useMic(){if(!navigator.mediaDevices?.getUserMedia)return!1;let e;try{e=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:!1,noiseSuppression:!1,autoGainControl:!0}})}catch{return!1}return this.closed?(e.getTracks().forEach(e=>e.stop()),!1):(this.stopMic(),this.stopMusic(),this.music.gain.setTargetAtTime(0,this.ctx.currentTime,.05),this.compTap&&=(this.comp.disconnect(this.analyser),!1),this.mic=e,this.micSrc=this.ctx.createMediaStreamSource(e),this.micSrc.connect(this.micGain).connect(this.analyser),!0)}stopMic(){this.micSrc?.disconnect(),this.micGain.disconnect(),this.micSrc=null,this.mic?.getTracks().forEach(e=>e.stop()),this.mic=null}dispose(){this.closed=!0,this.stopMusic(),this.stopMic();try{this.lfo.stop()}catch{}this.ctx.close()}stepAt(e,t){let n=e>>4,r=e&15,i=k[n],a=60/this.bpm/4;r%4==0&&this.kick(t),(r===4||r===12)&&this.clap(t),r%4==2?this.hat(t,.3,.05):r%2==1&&n>=2&&this.hat(t,.07,.025),r===14&&n===3&&this.hat(t,.16,.28);let o=A[r];o!==void 0&&this.bass(t,i.root+o,a*(r===11||r===15?.8:1.6)),r===0&&this.pad(t,i.notes,a*16),this.arp(t,i.notes[j[r%8]]+12+(r>=12&&n%2==1?12:0),r%4==0?.075:.045)}kick(e){let t=this.ctx,n=t.createOscillator(),r=t.createGain();n.type=`sine`,n.frequency.setValueAtTime(165,e),n.frequency.exponentialRampToValueAtTime(52,e+.09),n.frequency.exponentialRampToValueAtTime(43,e+.4),r.gain.setValueAtTime(1e-4,e),r.gain.exponentialRampToValueAtTime(.95,e+.003),r.gain.exponentialRampToValueAtTime(.001,e+.34),n.connect(r).connect(this.drums),n.start(e),n.stop(e+.38);let i=this.padDuck.gain;i.setValueAtTime(1,e),i.linearRampToValueAtTime(.22,e+.012),i.linearRampToValueAtTime(1,e+.34)}noiseHit(e,t,n,r){let i=this.ctx.createBufferSource();i.buffer=this.noise,i.connect(t).connect(n).connect(this.drums),i.start(e,Math.random()*.5),i.stop(e+r)}hat(e,t,n){let r=this.ctx,i=r.createBiquadFilter();i.type=`highpass`,i.frequency.value=7200;let a=r.createGain();a.gain.setValueAtTime(t,e),a.gain.exponentialRampToValueAtTime(.001,e+n),this.noiseHit(e,i,a,n+.02)}clap(e){let t=this.ctx,n=t.createBiquadFilter();n.type=`bandpass`,n.frequency.value=1350,n.Q.value=.9;let r=t.createGain();r.gain.setValueAtTime(0,e);for(let t=0;t<3;t++){let n=e+t*.011;r.gain.setValueAtTime(.6,n),r.gain.exponentialRampToValueAtTime(.08,n+.009)}r.gain.setValueAtTime(.5,e+.033),r.gain.exponentialRampToValueAtTime(.001,e+.24),this.noiseHit(e,n,r,.26)}bass(e,t,n){let r=this.ctx,i=r.createOscillator();i.type=`sawtooth`,i.frequency.value=O(t);let a=r.createOscillator();a.type=`sine`,a.frequency.value=O(t);let o=r.createBiquadFilter();o.type=`lowpass`,o.Q.value=6,o.frequency.setValueAtTime(170,e),o.frequency.exponentialRampToValueAtTime(1250,e+.02),o.frequency.exponentialRampToValueAtTime(240,e+n);let s=r.createGain();s.gain.setValueAtTime(0,e),s.gain.linearRampToValueAtTime(.32,e+.006),s.gain.exponentialRampToValueAtTime(.14,e+n),s.gain.linearRampToValueAtTime(0,e+n+.04);let c=r.createGain();c.gain.value=.45,i.connect(o).connect(s).connect(this.music),a.connect(c).connect(s),i.start(e),a.start(e),i.stop(e+n+.06),a.stop(e+n+.06)}pad(e,t,n){let r=this.ctx,i=r.createGain();i.gain.setValueAtTime(0,e),i.gain.linearRampToValueAtTime(.075,e+.35),i.gain.setValueAtTime(.075,e+n-.1),i.gain.linearRampToValueAtTime(0,e+n+.6),i.connect(this.padFilter);for(let a of t)for(let t of[-9,9]){let o=r.createOscillator();o.type=`sawtooth`,o.frequency.value=O(a),o.detune.value=t,o.connect(i),o.start(e),o.stop(e+n+.7)}}arp(e,t,n){let r=this.ctx,i=r.createOscillator();i.type=`square`,i.frequency.value=O(t);let a=r.createBiquadFilter();a.type=`lowpass`,a.frequency.setValueAtTime(3400,e),a.frequency.exponentialRampToValueAtTime(900,e+.16);let o=r.createGain();o.gain.setValueAtTime(0,e),o.gain.linearRampToValueAtTime(n,e+.004),o.gain.exponentialRampToValueAtTime(.001,e+.2),i.connect(a).connect(o).connect(this.arpBus),i.start(e),i.stop(e+.22)}},N=30,P=14e3,F=1/40,I=e=>Math.round(255*Math.log(e/N)/Math.log(P/N)),L={sub:[0,I(60)],bass:[I(60),I(250)],mid:[I(250),I(2e3)],high:[I(2e3),I(12e3)]},R=(e,[t,n])=>{let r=0;for(let i=t;i<n;i++)r+=e[i];return r/(n-t)},ee=class{data=new Uint8Array(32768);texture;cur=new Float32Array(256);raw=new Float32Array(256);fft=new Uint8Array(1024);lo=new Float32Array(256);hi=new Float32Array(256);mappedRate=0;sub=0;bass=0;mid=0;high=0;highN=0;highPeak=.12;scroll=0;beatCount=0;acc=0;avg=.25;prevE=0;lastBeat=-9;idleKickAt=0;time=0;constructor(){let e=new v(this.data,256,128,u,m);e.minFilter=f,e.magFilter=f,e.wrapS=c,e.wrapT=c,e.needsUpdate=!0,this.texture=e}map(e){let t=e/2,n=this.fft.length;for(let e=0;e<256;e++){let r=N*(P/N)**((e-.5)/255),i=N*(P/N)**((e+.5)/255);this.lo[e]=r/t*n,this.hi[e]=i/t*n}this.mappedRate=e}update(e,t,n){this.time+=e;let r=this.time,i=this.raw;r-this.idleKickAt>.95&&(this.idleKickAt=r);let a=Math.exp(-(r-this.idleKickAt)*6);for(let e=0;e<256;e++){let t=e/255,o=.5+.3*Math.sin(e*.13+r*1.7)+.2*Math.sin(e*.051-r*.9+1.3)*Math.sin(r*.37+e*.02),s=(.5*Math.exp(-t*2)+.1)*(.45+.7*o)+a*.5*Math.exp(-t*9);t>.62&&(s+=.14*Math.max(0,Math.sin(e*1.7+r*9)*Math.sin(e*.31-r*5.3))),i[e]=s*(1-n)}if(t&&n>0){t.context.sampleRate!==this.mappedRate&&this.map(t.context.sampleRate),t.getByteFrequencyData(this.fft);let e=this.fft,r=e.length-1;for(let t=0;t<256;t++){let a=this.lo[t],o=this.hi[t],s;if(o-a<1){let t=Math.min((a+o)/2,r-1),n=Math.floor(t);s=e[n]+(e[n+1]-e[n])*(t-n)}else{s=0;for(let t=Math.floor(a),n=Math.min(Math.ceil(o),r);t<=n;t++)s=Math.max(s,e[t])}let c=t/255;s=s/255*(.88+.7*c),s=Math.max(0,(s-.14)/.86),i[t]+=s**1.45*n}}let o=1-Math.exp(-e*30),s=1-Math.exp(-e*7),c=this.cur;for(let e=0;e<256;e++){let t=Math.min(1,i[e]);c[e]+=(t-c[e])*(t>c[e]?o:s)}let l=R(c,L.sub),u=R(c,L.bass),d=1-Math.exp(-e*12);this.sub+=(l-this.sub)*d,this.bass+=(u-this.bass)*d,this.mid+=(R(c,L.mid)-this.mid)*d,this.high+=(R(c,L.high)-this.high)*d,this.highPeak=Math.max(this.high,this.highPeak*Math.exp(-e/5),.1),this.highN=this.high/this.highPeak;let f=R(i,L.sub)*.6+R(i,L.bass)*.4,p=0;for(f>this.avg*1.15+.035&&f-this.prevE>.012&&r-this.lastBeat>.3&&(p=Math.min(1,Math.max(.3,(f-this.avg)*3)),this.lastBeat=r,this.beatCount++),this.prevE=f,this.avg+=(f-this.avg)*(1-Math.exp(-e/.5)),this.acc+=e;this.acc>=F;)this.data.copyWithin(256,0,32512),this.acc-=F;this.scroll=this.acc/F;for(let e=0;e<256;e++)this.data[e]=Math.round(c[e]*255);return this.texture.needsUpdate=!0,p}},z=n(),B=typeof window<`u`&&window.innerWidth<760,V=B?560:896,H=B?36:48,U=V*H,W=B?84:120,G=B?64:96,K=[{key:`sphere`,zh:`球体`,short:`球体`,en:`Spectral Sphere`,aside:`${G} latitude rings · log bands`},{key:`rings`,zh:`圆环`,short:`圆环`,en:`Ring of Rings`,aside:`${W} rings · mirrored spectrum`},{key:`terrain`,zh:`频谱地形`,short:`地形`,en:`Spectrogram Terrain`,aside:`${H} ridgelines · 3.2 s history`}],q=-.95,J=.5,Y=-1.05,X=[{rx:0,y:0,z:0,r0:1.55,grow:.9},{rx:q,y:0,z:0,r0:2.1,grow:.5},{rx:-Math.PI/2+J,y:Y*Math.cos(J)+1.4*Math.sin(J),z:Y*Math.sin(J)-1.4*Math.cos(J),r0:.8,grow:1.5}],te=`
uniform sampler2D uSpec;
uniform float uTime, uKick, uBass, uHigh, uScroll, uPR, uSize, uProg, uSpin, uSway, uAlpha;
uniform vec3 uFromW, uToW;
attribute vec2 aTorus;
attribute vec2 aGrid;
attribute vec3 aU;
attribute float aRnd;
varying vec3 vCol;
varying float vA;

float specAt(float u, float age) {
  float v = (clamp(age, 0.0, 127.0) + 0.5) / 128.0;
  return texture2D(uSpec, vec2((u * 255.0 + 0.5) / 256.0, v)).r;
}
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
float hash(float n) { return fract(sin(n) * 43758.5453); }

vec3 pal(float u) {
  // sRGB stops: hot pink (bass) → violet → blue → cyan (highs)
  vec3 c0 = vec3(1.0, 0.31, 0.85);
  vec3 c1 = vec3(0.64, 0.34, 1.0);
  vec3 c2 = vec3(0.30, 0.50, 1.0);
  vec3 c3 = vec3(0.30, 0.95, 1.0);
  float t = clamp(u, 0.0, 1.0) * 3.0;
  return t < 1.0 ? mix(c0, c1, t) : t < 2.0 ? mix(c1, c2, t - 1.0) : mix(c2, c3, t - 2.0);
}

void main() {
  // 30% of the sphere / ring particles are "echoes" that replay the last ~0.5 s → soft motion trails
  float echo = step(0.7, aRnd);
  float eAge = echo * (aRnd - 0.7) / 0.3;
  float age = eAge * 20.0;
  float jit = (fract(aRnd * 37.0) - 0.5);

  // 1 · sphere — stacked latitude rings (|y|, equal-area) → band; each ring is pushed out by its level
  float mS = specAt(aU.x, age);
  vec3 d = position;
  float wob = 0.03 * sin(d.x * 5.0 + uTime * 0.9) * sin(d.z * 4.0 - uTime * 0.7 + d.y * 3.0);
  vec3 dS = rotX(rotY(d, uSpin), 0.22);
  vec3 pS = dS * (1.4 + wob + jit * 0.025 + mS * 0.95);

  // 2 · ring of rings — angle around the big ring (mirrored, bass at the front) → band; each small ring swells
  float mT = specAt(aU.y, age);
  float phi = aTorus.x;
  float th = aTorus.y + uTime * 0.35;
  float rt = 0.06 + mT * 0.8 + jit * 0.02;
  vec3 nT = vec3(cos(th) * cos(phi), cos(th) * sin(phi), sin(th));
  vec3 pT = rotY(rotX(vec3(cos(phi), sin(phi), 0.0) * (2.05 + mT * 0.18) + nT * rt, ${q.toFixed(3)}), uSway);

  // 3 · spectrogram terrain — columns = bands (mirrored, bass in the middle), rows = history
  float mG = specAt(aU.z, aGrid.y * 126.0 + 1.0 - uScroll);
  vec3 pG = rotX(vec3((aGrid.x - 0.5) * ${B?`4.6`:`6.2`}, ${Y.toFixed(3)} + mG * 1.7, 1.4 - aGrid.y * 6.4), ${J.toFixed(3)});

  // staggered morph with a little mid-flight swirl
  float pr = clamp((uProg - aRnd * 0.35) / 0.65, 0.0, 1.0);
  pr = pr * pr * (3.0 - 2.0 * pr);
  vec3 a = pS * uFromW.x + pT * uFromW.y + pG * uFromW.z;
  vec3 b = pS * uToW.x + pT * uToW.y + pG * uToW.z;
  vec3 W = mix(uFromW, uToW, pr);
  vec3 p = mix(a, b, pr);
  float arc = sin(pr * 3.14159);
  p += vec3(sin(aRnd * 40.0 + uTime), cos(aRnd * 31.0 - uTime * 0.7), sin(aRnd * 17.0 + 1.0)) * arc * 0.6;

  float m = dot(W, vec3(mS, mT, mG));
  float u = dot(W, aU);

  // bass: global pulse
  p *= 1.0 + uKick * 0.075 + uBass * 0.05;

  // highs: sparkle on the rim (sphere silhouette, high bands everywhere)
  vec3 nV = normalize(normalMatrix * dS);
  float rim = max(W.x * pow(1.0 - abs(nV.z), 2.0), smoothstep(0.5, 1.0, u));
  float tw = step(0.84 - uHigh * 0.5, hash(aRnd * 913.0 + floor(uTime * 16.0 + aRnd * 7.0)));
  float spark = rim * tw * smoothstep(0.04, 0.45, uHigh);

  vec3 col = pal(u);
  col = mix(col, vec3(1.0, 0.93, 0.98), smoothstep(0.55, 1.0, m) * 0.4 + spark * 0.55);
  col += vec3(1.0, 0.35, 0.8) * max(uKick, 0.0) * (1.0 - u) * 0.45;
  float bright = 0.16 + m * 1.2 + spark * 1.4;
  float fade = mix(1.0 - eAge * 0.75, 1.0 - aGrid.y * 0.82, W.z);
  vCol = pow(col, vec3(2.2)) * bright;
  vA = uAlpha * fade;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPR * (0.75 + m * 0.9 + spark * 1.8) * (9.0 / -mv.z);
}
`,ne=`
varying vec3 vCol;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float f = 1.0 - d * 4.0;
  gl_FragColor = vec4(vCol, vA * f * f);
  #include <colorspace_fragment>
}
`,Z=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`,re=`
uniform float uA, uThick;
varying vec2 vUv;
void main() {
  vec2 c = (vUv - 0.5) * 2.0;
  float r = length(c);
  float d = (r - 0.9) / uThick;
  float a = exp(-d * d * 2.0);
  float ang = atan(c.y, c.x) / 6.2831853;
  float dots = 0.2 + 0.8 * step(0.5, fract(ang * 220.0));
  vec3 col = mix(vec3(1.0, 0.31, 0.85), vec3(1.0, 0.85, 0.97), a * 0.5);
  gl_FragColor = vec4(pow(col, vec3(2.2)) * a * dots * 1.3, uA);
  #include <colorspace_fragment>
}
`,ie=`
uniform float uBass, uKick;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  vec3 pink = pow(vec3(1.0, 0.31, 0.85), vec3(2.2));
  vec3 vio = pow(vec3(0.42, 0.3, 1.0), vec3(2.2));
  vec3 c = pink * exp(-d * d * 9.0) * (0.012 + uBass * 0.03 + max(uKick, 0.0) * 0.045) + vio * exp(-d * d * 3.0) * 0.014;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;function ae(){let e=U,t=new Float32Array(e*3),n=new Float32Array(e*2),r=new Float32Array(e*2),i=new Float32Array(e*3),a=new Float32Array(e),o=Math.PI*(3-Math.sqrt(5)),s=Math.floor(e/W);for(let c=0;c<e;c++){let l=Math.random();a[c]=l;let u=1-(c+.5)/e*2,d=(Math.min(G-1,Math.floor((u+1)/2*G))+.5)/G*2-1,f=Math.sqrt(1-d*d),p=c*o;t[c*3]=Math.cos(p)*f,t[c*3+1]=d,t[c*3+2]=Math.sin(p)*f,i[c*3]=Math.min(1,Math.abs(d)+(l-.5)*.006);let m=c%W,h=Math.floor(c/W),g=(m+.5)/W*Math.PI*2;n[c*2]=g-Math.PI/2,n[c*2+1]=h/s*Math.PI*2+m*.37,i[c*3+1]=(g>Math.PI?Math.PI*2-g:g)/Math.PI;let _=c%V,v=Math.floor(c/V);r[c*2]=_/(V-1),r[c*2+1]=v/(H-1),i[c*3+2]=Math.abs(_/(V-1)*2-1)}let c=new l;return c.setAttribute(`position`,new g(t,3)),c.setAttribute(`aTorus`,new g(n,2)),c.setAttribute(`aGrid`,new g(r,2)),c.setAttribute(`aU`,new g(i,3)),c.setAttribute(`aRnd`,new g(a,1)),c}var Q=[new d(1,0,0),new d(0,1,0),new d(0,0,1)],oe=e=>e*e*(3-2*e);function se({spec:e,engine:t,live:n,kick:i,prog:a,morph:o,meter:c}){let l=E(1.08),u=p(e=>e.viewport.dpr),f=(0,D.useMemo)(ae,[]);(0,D.useEffect)(()=>()=>f.dispose(),[f]);let m=(0,D.useMemo)(()=>({uSpec:{value:e.texture},uTime:{value:0},uKick:{value:0},uBass:{value:0},uHigh:{value:0},uScroll:{value:0},uPR:{value:1},uSize:{value:B?2:2.1},uProg:{value:1},uSpin:{value:0},uSway:{value:0},uAlpha:{value:B?.4:.62},uFromW:{value:new d(1,0,0)},uToW:{value:new d(1,0,0)}}),[e]),g=w(()=>({vertexShader:te,fragmentShader:ne,uniforms:m,transparent:!0,depthWrite:!1,blending:2})),v=(0,D.useMemo)(()=>({uBass:{value:0},uKick:{value:0}}),[]),y=w(()=>({vertexShader:Z,fragmentShader:ie,uniforms:v,transparent:!0,depthWrite:!1,blending:2})),b=(0,D.useMemo)(()=>[0,1,2,3].map(()=>new s({vertexShader:Z,fragmentShader:re,uniforms:{uA:{value:0},uThick:{value:.05}},transparent:!0,depthWrite:!1,blending:2,side:2})),[]);(0,D.useEffect)(()=>()=>b.forEach(e=>e.dispose()),[b]);let x=(0,D.useRef)([]),S=(0,D.useMemo)(()=>b.map(()=>({born:-9,str:0})),[b]),C=(0,D.useRef)(null),T=(0,D.useRef)(null),O=(0,D.useMemo)(()=>({t:0,spin:0,nextRing:0}),[]);return h((s,l)=>{let d=Math.min(l,1/30);O.t+=d;let f=O.t,p=t.current,h=n.get(),g=e.update(d,p&&h>.001?p.analyser:null,h);if(g>0){r(i,0,{type:`spring`,velocity:9+g*14,stiffness:320,damping:15});let e=S[O.nextRing];e.born=f,e.str=.45+g*.55,O.nextRing=(O.nextRing+1)%S.length}let y=i.get(),w=m;O.spin+=d*(.12+e.mid*.25),w.uTime.value=f,w.uKick.value=y,w.uBass.value=e.bass,w.uHigh.value=Math.min(1,e.highN*.9),w.uScroll.value=e.scroll,w.uPR.value=u,w.uSpin.value=O.spin,w.uSway.value=Math.sin(f*.21)*.32;let E=a.get();w.uProg.value=E;let D=o.current;w.uFromW.value.copy(Q[D.from]),w.uToW.value.copy(Q[D.to]),v.uBass.value=e.bass,v.uKick.value=y;let k=T.current;k&&(k.rotation.x=_.damp(k.rotation.x,s.pointer.y*-.14,2.5,d),k.rotation.y=_.damp(k.rotation.y,s.pointer.x*.2,2.5,d));let A=oe(Math.min(1,Math.max(0,(E-.15)/.7))),j=X[D.from],M=X[D.to],N=C.current;N&&(N.rotation.x=j.rx+(M.rx-j.rx)*A,N.rotation.y=(D.to===1?A:D.from===1?1-A:0)*w.uSway.value,N.position.set(0,j.y+(M.y-j.y)*A,j.z+(M.z-j.z)*A));let P=j.r0+(M.r0-j.r0)*A,F=j.grow+(M.grow-j.grow)*A;for(let e=0;e<S.length;e++){let t=x.current[e];if(!t)continue;let n=f-S[e].born,r=1.25;if(n>r){t.visible=!1;continue}let i=n/r,a=P*(1+(1-(1-i)**3)*F)/.45;t.visible=!0,t.scale.setScalar(a);let o=b[e].uniforms;o.uA.value=S[e].str*(1-i)**2*.6,o.uThick.value=(.022+i*.03)/(a/2)}let I=c.current;if(I){let t=[e.sub,e.bass,e.mid,e.highN*.85];for(let e=0;e<4;e++){let n=I.bars[e];n&&(n.style.transform=`scaleY(${Math.max(.06,Math.min(1,t[e])).toFixed(3)})`)}I.dot&&(I.dot.style.opacity=String(.22+Math.min(1,Math.max(0,y)*1.4)*.78))}}),(0,z.jsxs)(`group`,{position:[0,B?.95*l+.35:.1,0],scale:l,children:[(0,z.jsx)(`mesh`,{position:[0,0,-3],material:y,renderOrder:-1,children:(0,z.jsx)(`planeGeometry`,{args:[16,16]})}),(0,z.jsxs)(`group`,{ref:T,children:[(0,z.jsx)(`points`,{geometry:f,material:g,frustumCulled:!1}),(0,z.jsx)(`group`,{ref:C,"rotation-order":`YXZ`,children:b.map((e,t)=>(0,z.jsx)(`mesh`,{material:e,visible:!1,ref:e=>void(x.current[t]=e),children:(0,z.jsx)(`planeGeometry`,{args:[1,1]})},t))})]})]})}var $=()=>(0,z.jsx)(`svg`,{width:`14`,height:`14`,viewBox:`0 0 14 14`,"aria-hidden":!0,children:(0,z.jsx)(`path`,{d:`M3.5 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5Z`,fill:`currentColor`})}),ce=()=>(0,z.jsxs)(`svg`,{width:`14`,height:`14`,viewBox:`0 0 14 14`,"aria-hidden":!0,children:[(0,z.jsx)(`rect`,{x:`3`,y:`2`,width:`2.8`,height:`10`,rx:`1`,fill:`currentColor`}),(0,z.jsx)(`rect`,{x:`8.2`,y:`2`,width:`2.8`,height:`10`,rx:`1`,fill:`currentColor`})]}),le=({off:e})=>(0,z.jsxs)(`svg`,{width:`16`,height:`16`,viewBox:`0 0 16 16`,"aria-hidden":!0,fill:`none`,stroke:`currentColor`,strokeWidth:`1.5`,strokeLinecap:`round`,strokeLinejoin:`round`,children:[(0,z.jsx)(`path`,{d:`M2.5 6v4h2.6L8.5 13V3L5.1 6H2.5Z`,fill:`currentColor`,stroke:`none`}),e?(0,z.jsx)(`path`,{d:`m11 6 3.5 4M14.5 6 11 10`}):(0,z.jsx)(`path`,{d:`M11 5.6a3.4 3.4 0 0 1 0 4.8M12.8 3.8a6 6 0 0 1 0 8.4`})]}),ue=()=>(0,z.jsxs)(`svg`,{width:`15`,height:`15`,viewBox:`0 0 16 16`,"aria-hidden":!0,fill:`none`,stroke:`currentColor`,strokeWidth:`1.5`,strokeLinecap:`round`,children:[(0,z.jsx)(`rect`,{x:`5.5`,y:`1.8`,width:`5`,height:`8.2`,rx:`2.5`,fill:`currentColor`,stroke:`none`}),(0,z.jsx)(`path`,{d:`M3.3 7.6a4.7 4.7 0 0 0 9.4 0M8 12.4v2`})]});function de(){let[e,t]=(0,D.useState)(0),[n,s]=(0,D.useState)(!0),[c,l]=(0,D.useState)(`demo`),[u,d]=(0,D.useState)(!1),[f,p]=(0,D.useState)(!1),[m,h]=(0,D.useState)(!1),[g,_]=(0,D.useState)(48e3),[v,w]=(0,D.useState)(null),E=(0,D.useRef)(null),O=(0,D.useMemo)(()=>new ee,[]),k=i(0),A=i(0),j=i(1),N=(0,D.useRef)({from:0,to:0}),P=(0,D.useRef)({bars:[],dot:null}),F=(0,D.useRef)(0);(0,D.useEffect)(()=>()=>{E.current?.dispose(),E.current=null,clearTimeout(F.current)},[]),(0,D.useEffect)(()=>()=>O.texture.dispose(),[O]),(0,D.useEffect)(()=>{let t=N.current;if(t.to===e)return;j.get()>=.5&&(t.from=t.to),t.to=e,j.set(0);let n=r(j,1,{duration:1.9,ease:[.65,0,.35,1]});return()=>n.stop()},[e,j]),(0,D.useEffect)(()=>{if(!n||b)return;let e=setInterval(()=>t(e=>(e+1)%K.length),11e3);return()=>clearInterval(e)},[n]);let I=(0,D.useCallback)((e,t=!1)=>{clearTimeout(F.current),w({id:performance.now(),text:e,warn:t}),F.current=window.setTimeout(()=>w(null),3400)},[]),L=()=>(E.current||(E.current=new M,E.current.setMuted(m),_(E.current.ctx.sampleRate)),E.current.ctx.resume(),E.current),R=()=>{d(!0),p(!0),r(A,1,{duration:.9,ease:`easeOut`})},V=()=>{L().useDemo(),l(`demo`),R()},H=async()=>{let e=L();l(`mic`),d(!0),I(`正在请求麦克风权限…`);let t=await e.useMic();E.current===e&&(t?(I(`麦克风已接入：说话、拍手或外放一首歌`),R()):(I(`没有拿到麦克风权限，已切回示例音乐`,!0),V()))},W=e=>{e===c&&f||(e===`mic`?H():V())},G=()=>{let e=E.current;if(!e||!u)return V();f?(e.ctx.suspend(),p(!1),r(A,0,{duration:.7,ease:`easeInOut`})):(e.ctx.resume(),p(!0),r(A,1,{duration:.7,ease:`easeOut`}))},q=()=>{E.current?.setMuted(!m),h(!m)},J=K[e],Y=!u||!f?`待机模拟 · IDLE`:c===`mic`?`麦克风 · LIVE`:`示例音乐 · 116 BPM`;return(0,z.jsxs)(`div`,{className:`stage`,style:{background:`#08080e`},children:[(0,z.jsx)(`style`,{children:fe}),(0,z.jsxs)(y,{dpr:[1,2],camera:{position:[0,0,9],fov:42},gl:{antialias:!1,alpha:!1},children:[(0,z.jsx)(`color`,{attach:`background`,args:[`#08080e`]}),(0,z.jsx)(se,{spec:O,engine:E,live:A,kick:k,prog:j,morph:N,meter:P}),(0,z.jsx)(S,{multisampling:0,children:(0,z.jsx)(C,{mipmapBlur:!0,intensity:.9,luminanceThreshold:.3,luminanceSmoothing:.3,radius:.65})})]}),(0,z.jsxs)(`div`,{className:`overlay`,children:[(0,z.jsx)(T,{id:J.key,meta:`FFT 2048 · ${+(g/1e3).toFixed(1)} kHz · ${U.toLocaleString()} particles`,title:J.zh,sub:J.en,aside:J.aside}),(0,z.jsxs)(`div`,{className:`ar-meter`+(u?``:` pre`),"aria-hidden":!0,children:[(0,z.jsxs)(`p`,{children:[(0,z.jsx)(`i`,{ref:e=>void(P.current.dot=e)}),Y]}),(0,z.jsx)(`div`,{className:`ar-bars`,children:[`SUB`,`BASS`,`MID`,`HIGH`].map((e,t)=>(0,z.jsxs)(`div`,{children:[(0,z.jsx)(`span`,{children:(0,z.jsx)(`b`,{ref:e=>void(P.current.bars[t]=e)})}),(0,z.jsx)(`em`,{children:e})]},e))})]}),(0,z.jsx)(o,{children:!u&&(0,z.jsxs)(a.div,{className:`ar-gate`,initial:{opacity:0,scale:.94},animate:{opacity:1,scale:1},exit:{opacity:0,scale:1.06,filter:`blur(8px)`},transition:{duration:.5,ease:[.23,1,.32,1]},children:[(0,z.jsxs)(`button`,{className:`ar-play`,onClick:V,children:[(0,z.jsx)(`span`,{children:`播放示例音乐`}),(0,z.jsx)(`i`,{children:(0,z.jsx)($,{})})]}),(0,z.jsx)(`p`,{children:`116 BPM · 浏览器实时合成，没有音频文件`}),(0,z.jsx)(`button`,{className:`ar-alt`,onClick:()=>W(`mic`),children:`或者用麦克风驱动`})]})}),(0,z.jsx)(o,{children:v&&(0,z.jsx)(a.div,{className:`ar-toast`+(v.warn?` warn`:``),role:`status`,initial:{opacity:0,y:-10,filter:`blur(4px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},exit:{opacity:0,y:-8,filter:`blur(4px)`},transition:{duration:.35,ease:[.23,1,.32,1]},children:v.text},v.id)}),(0,z.jsxs)(`div`,{className:`dock ar-dock`,children:[(0,z.jsx)(x,{items:K.map((e,t)=>({value:t,label:B?e.short:e.zh})),value:e,onChange:e=>{t(e),s(!1)}}),(0,z.jsx)(`span`,{className:`dock-sep`}),B?(0,z.jsx)(`button`,{className:`seg ar-icon`,"aria-label":`使用麦克风`,"aria-pressed":c===`mic`&&u,onClick:()=>W(c===`mic`?`demo`:`mic`),children:(0,z.jsx)(ue,{})}):(0,z.jsx)(x,{items:[{value:`demo`,label:`示例音乐`},{value:`mic`,label:`麦克风`}],value:c,onChange:W}),(0,z.jsx)(`span`,{className:`dock-sep`}),(0,z.jsx)(`button`,{className:`seg ar-icon`,"aria-label":f?`暂停`:`播放`,onClick:G,children:f?(0,z.jsx)(ce,{}):(0,z.jsx)($,{})}),(0,z.jsx)(`button`,{className:`seg ar-icon`,"aria-label":m?`取消静音`:`静音`,"aria-pressed":m,onClick:q,children:(0,z.jsx)(le,{off:m})})]})]})]})}var fe=`
.ar-gate {
  position: absolute; left: 0; right: 0; top: 50%; margin-top: -70px;
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  pointer-events: none !important;
}
.ar-gate > * { pointer-events: auto }
.ar-gate::before {
  content: ''; position: absolute; z-index: -1; left: 50%; top: 50%; width: 560px; height: 300px; translate: -50% -50%;
  background: radial-gradient(closest-side, rgba(8, 8, 14, .72), rgba(8, 8, 14, .4) 55%, transparent);
  pointer-events: none;
}
.ar-gate p, .ar-alt { text-shadow: 0 1px 12px rgba(8, 8, 14, .9) }
.ar-play {
  position: relative; display: inline-flex; align-items: center; gap: 14px;
  height: 64px; padding: 0 10px 0 28px; border: 0; border-radius: 999px; cursor: pointer;
  font: 600 18px/1 var(--display); letter-spacing: .01em; color: #fff;
  background: rgba(20, 14, 30, .55);
  box-shadow: inset 0 0 0 1px rgba(255, 140, 230, .35), 0 0 0 0 rgba(255, 79, 216, .5), 0 18px 60px -20px rgba(255, 79, 216, .7);
  backdrop-filter: blur(18px) saturate(1.5); -webkit-backdrop-filter: blur(18px) saturate(1.5);
  transition: transform .18s var(--ease-out), box-shadow .3s;
  animation: ar-pulse 2.2s cubic-bezier(.2, .7, .3, 1) infinite;
}
.ar-play:hover { box-shadow: inset 0 0 0 1px rgba(255, 160, 235, .6), 0 0 0 0 rgba(255, 79, 216, .5), 0 18px 70px -16px rgba(255, 79, 216, .85) }
.ar-play:active { transform: scale(.96) }
.ar-play i {
  display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%;
  background: #ff4fd8; color: #1a0716; box-shadow: 0 0 24px rgba(255, 79, 216, .7);
}
.ar-play i svg { margin-left: 2px; width: 16px; height: 16px }
@keyframes ar-pulse {
  0% { box-shadow: inset 0 0 0 1px rgba(255, 140, 230, .35), 0 0 0 0 rgba(255, 79, 216, .45), 0 18px 60px -20px rgba(255, 79, 216, .7) }
  70%, 100% { box-shadow: inset 0 0 0 1px rgba(255, 140, 230, .35), 0 0 0 22px rgba(255, 79, 216, 0), 0 18px 60px -20px rgba(255, 79, 216, .7) }
}
.ar-gate p { margin: 4px 0 0; font: 500 12px/1 var(--mono); letter-spacing: .06em; color: rgba(244, 242, 238, .62) }
.ar-alt {
  border: 0; background: none; cursor: pointer; padding: 6px 10px;
  font: 500 13px/1 var(--sans); color: rgba(244, 242, 238, .78);
  text-decoration: underline; text-decoration-color: rgba(244, 242, 238, .3); text-underline-offset: 4px;
}
.ar-alt:hover { color: #fff }
.ar-toast {
  position: absolute; top: 84px; left: 50%; translate: -50% 0;
  padding: 10px 16px; border-radius: 999px; white-space: nowrap;
  font: 500 13px/1 var(--sans); color: var(--fg);
  background: var(--glass); box-shadow: inset 0 0 0 1px var(--glass-line);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.ar-toast.warn { box-shadow: inset 0 0 0 1px rgba(255, 180, 120, .45); color: #ffd9b8 }
.ar-dock .ar-icon { width: 36px; padding: 0; display: grid; place-items: center }
.ar-dock .ar-icon svg { display: block }
.ar-dock .ar-icon[aria-pressed='true'] { color: #ff8fe6 }
.ar-meter {
  position: absolute; right: clamp(24px, 6vw, 96px); bottom: 104px;
  pointer-events: none !important; text-align: right;
}
.ar-meter p {
  display: inline-flex; align-items: center; gap: 8px; margin: 0 0 12px;
  font: 500 11px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2);
}
.ar-meter p i { width: 6px; height: 6px; border-radius: 50%; background: #ff4fd8; box-shadow: 0 0 10px #ff4fd8; opacity: .22 }
.ar-bars { display: flex; justify-content: flex-end; gap: 10px }
.ar-bars > div { display: flex; flex-direction: column; align-items: center; gap: 7px }
.ar-bars span { position: relative; display: block; width: 6px; height: 46px; border-radius: 3px; background: rgba(255, 255, 255, .07); overflow: hidden }
.ar-bars b {
  position: absolute; inset: 0; border-radius: 3px; transform-origin: 50% 100%; transform: scaleY(.06);
  background: linear-gradient(to top, #ff4fd8, #9a6bff 60%, #5ff0ff);
}
.ar-bars em { font: normal 500 9px/1 var(--mono); letter-spacing: .06em; color: rgba(244, 242, 238, .45) }
@media (max-width: 760px) {
  .ar-gate { margin-top: 90px }
  .ar-gate::before { width: 400px; height: 240px }
  .ar-play { height: 58px; font-size: 17px; padding-left: 24px }
  .ar-play i { width: 40px; height: 40px }
  .ar-meter { right: 20px; bottom: 214px; transition: opacity .4s }
  .ar-meter.pre { opacity: 0 }
  .ar-meter p { font-size: 10px; margin-bottom: 10px }
  .ar-bars { gap: 7px }
  .ar-bars span { height: 34px; width: 5px }
}
`;export{de as default};