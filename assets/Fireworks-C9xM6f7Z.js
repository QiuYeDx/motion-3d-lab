import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{n as r,r as i}from"./index-gQ65n0JU.js";import{E as a,It as o,Lt as s,P as c,Rt as l,Sn as u,T as d,Wt as f,Xt as p,Yt as m,bn as h,h as g,it as _,k as v,ot as y,q as b,st as x,u as S,vn as ee,wt as C,xt as w,yn as T}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as E}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as D}from"./iso-CLB38p39.js";import{t as O}from"./Seg-CH5KfWEm.js";import{r as te,t as k}from"./dist-NDw4pbEK.js";import{t as A}from"./PerformanceMonitor-DOuNfnyh.js";import{t as j}from"./BigLabel-CceM23C6.js";var M=e(t(),1),N=[{id:`chrys`,zh:`菊花`,en:`Chrysanthemum`,aside:`spherical · comet trails`},{id:`peony`,zh:`牡丹`,en:`Peony`,aside:`crisp stars · pistil core`},{id:`willow`,zh:`柳枝`,en:`Willow`,aside:`long drooping gold`},{id:`ring`,zh:`环形`,en:`Ring`,aside:`random plane · core`},{id:`heart`,zh:`心形`,en:`Heart`,aside:`shaped burst`},{id:`star`,zh:`星形`,en:`Star`,aside:`shaped burst`},{id:`crackle`,zh:`闪烁`,en:`Crackle`,aside:`strobe · crackling`}],P=e=>{let t=new c(e);return[t.r,t.g,t.b]},F=[[`#ff3048`,`#ffc24a`],[`#38ff7a`,`#eef4ff`],[`#3f6bff`,`#c060ff`],[`#ffc94a`,`#ff3a2e`],[`#e8eeff`,`#4aa0ff`],[`#ff4fb8`,`#fff0f6`],[`#2ff0ff`,`#6dff5a`],[`#a85cff`,`#ff4f8f`],[`#ff7a1e`,`#3dff9a`]].map(([e,t])=>[P(e),P(t)]),I=F.length,L=P(`#ffb347`),R=P(`#ff5a14`),ne=[1,1,1],re=P(`#fff2cf`),z=24,B=0,V=1,H=2,U=3,W=4,G=5,ie=6,K=7,ae=8,oe=9,se=10,q=11,J=12,Y=13,ce=14,le=15,ue=16,de=17,X=18,fe=19,pe=20,me=21,Z=22,Q=23,he=0,ge=1,_e=2,ve=3,ye=4,be=1,xe=2,Se=4,Ce=class{max;P;n=0;outPos;outCol;outSize;outCount=0;rockets=[];flashes=[];puffs=[];smokePos=new Float32Array(720);smokeCol=new Float32Array(960);smokeSize=new Float32Array(720);smokeCount=0;quality;scale=1;audio=null;onBurst=null;shells=0;constructor(e,t){this.max=e,this.quality=t,this.P=new Float32Array(e*z),this.outPos=new Float32Array((e+64)*3),this.outCol=new Float32Array((e+64)*3),this.outSize=new Float32Array(e+64)}add(){if(this.n>=this.max)return-1;let e=this.n*z;return this.n++,this.P.fill(0,e,e+z),e}star(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h){let g=this.add();if(g<0)return;let _=this.P;_[g+B]=e,_[g+V]=t,_[g+H]=n,_[g+U]=r,_[g+W]=i,_[g+G]=a,_[g+K]=o,_[g+ae]=s,_[g+oe]=c,_[g+se]=l,_[g+q]=u[0],_[g+J]=u[1],_[g+Y]=u[2],_[g+ce]=d[0],_[g+le]=d[1],_[g+ue]=d[2],_[g+de]=f,_[g+X]=he,_[g+fe]=p,_[g+pe]=Math.random(),_[g+me]=Math.random(),_[g+Z]=h,_[g+Q]=m}ember(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m){let h=this.add();if(h<0)return;let g=this.P;g[h+B]=e,g[h+V]=t,g[h+H]=n,g[h+U]=r,g[h+W]=i,g[h+G]=a,g[h+K]=o,g[h+ae]=s,g[h+oe]=c,g[h+se]=l,g[h+q]=u,g[h+J]=d,g[h+Y]=f,g[h+X]=p,g[h+me]=Math.random(),g[h+Z]=m}launch(e,t,n,r,i=Math.floor(Math.random()*F.length),a=0){let o=1.05+t/40*.75+Math.random()*.15;this.rockets.push({x0:e+(Math.random()-.5)*4,x1:e,y1:t,z:n,t:-a/o,dur:o,type:r,pal:i,seed:Math.random()*100,acc:0,px:e,py:0,scale:this.scale})}rocketPos(e,t,n){let r=1-(1-t)*(1-t);n.x=e.x0+(e.x1-e.x0)*(t*(2-t))+Math.sin(t*17+e.seed)*.32*(1-t)+Math.sin(t*41+e.seed*2)*.08,n.y=e.y1*r}burst(e,t,n,r){let i=this.quality,a=e.scale,[o,s]=F[e.pal],c=Math.random,l=0,u=(e,t,n)=>{let r=c()*Math.PI*2;for(let i=0;i<e;i++){let a=(i+.5)/e,o=Math.acos(1-2*a),s=r+i*2.39996323;n(Math.sin(o)*Math.cos(s),Math.cos(o),Math.sin(o)*Math.sin(s),t*(.9+c()*.18))}},d=e=>{let t,n,r;if(e){let e=(c()-.5)*.7,i=(c()-.5)*.35;t=Math.sin(e),n=Math.sin(i),r=Math.cos(e)*Math.cos(i)}else do{t=c()*2-1,n=c()*2-1,r=c()*2-1;let e=Math.hypot(t,n,r)||1;t/=e,n/=e,r/=e}while(Math.abs(r)<.4);let i=r,a=0,o=-t,s=Math.hypot(i,a,o)||1;if(i/=s,a/=s,o/=s,e){let e=(c()-.5)*.35,s=Math.cos(e),l=Math.sin(e),u=n*o-r*a,d=r*i-t*o,f=t*a-n*i;return{ux:i*s+u*l,uy:a*s+d*l,uz:o*s+f*l,vx:u*s-i*l,vy:d*s-a*l,vz:f*s-o*l}}return{ux:i,uy:a,uz:o,vx:n*o-r*a,vy:r*i-t*o,vz:t*a-n*i}},f=(e,i,a,u,f)=>{let p=d(!0),m=[0];for(let t=1;t<e.length;t++)m.push(m[t-1]+Math.hypot(e[t][0]-e[t-1][0],e[t][1]-e[t-1][1]));let h=m[m.length-1],g=1;for(let d=0;d<i;d++){let _=d/i*h;for(;g<m.length-1&&m[g]<_;)g++;let v=(_-m[g-1])/Math.max(1e-6,m[g]-m[g-1]),y=e[g-1][0]+(e[g][0]-e[g-1][0])*v,b=e[g-1][1]+(e[g][1]-e[g-1][1])*v,x=a*(.98+c()*.04);this.star(t,n,r,(p.ux*y+p.vx*b)*x,(p.uy*y+p.vy*b)*x,(p.uz*y+p.vz*b)*x,u*(.95+c()*.1),1.9,1.1,.5,o,s,.62,f,0,1.9),l++}};switch(e.type){case`chrys`:u(Math.round(140*i),21*a,(e,i,a,u)=>{this.star(t,n,r,e*u,i*u,a*u,2+c()*.5,1.55,5.2,.42,o,s,.6,46,0,1.6),l++});break;case`peony`:{u(Math.round(160*i),22*a,(e,i,a,u)=>{this.star(t,n,r,e*u,i*u,a*u,1.6+c()*.4,1.75,4.6,.6,o,s,.55,0,0,2.1),l++});let[d]=F[(e.pal+4)%F.length];u(Math.round(48*i),9*a,(e,i,a,o)=>{this.star(t,n,r,e*o,i*o,a*o,1.2+c()*.3,1.8,4,.48,d,ne,.7,0,0,2),l++});break}case`willow`:u(Math.round(66*i),16*a,(e,i,a,o)=>{this.star(t,n,r,e*o,i*o+1.5,a*o,3.3+c()*.7,2.3,2.6,.42,L,R,.85,52,Se,1.6),l++});break;case`ring`:{let f=d(!1),p=Math.round(96*i),m=20*a,h=c()*6.28;for(let e=0;e<p;e++){let i=h+e/p*Math.PI*2,a=Math.cos(i),u=Math.sin(i),d=m*(.985+c()*.03);this.star(t,n,r,(f.ux*a+f.vx*u)*d,(f.uy*a+f.vy*u)*d,(f.uz*a+f.vz*u)*d,1.9+c()*.3,1.6,3.2,.52,o,s,.6,14,0,2),l++}let[g]=F[(e.pal+3)%F.length];u(Math.round(36*i),7*a,(e,i,a,o)=>{this.star(t,n,r,e*o,i*o,a*o,1.3+c()*.3,1.6,3,.46,g,g,1,0,0,2),l++});break}case`heart`:{let e=[];for(let t=0;t<=64;t++){let n=t/64*Math.PI*2,r=16*Math.sin(n)**3,i=13*Math.cos(n)-5*Math.cos(2*n)-2*Math.cos(3*n)-Math.cos(4*n);e.push([r/16,(i+2)/16])}f(e,Math.round(120*i),19*a,2.3,6);break}case`star`:{let e=[];for(let t=0;t<=10;t++){let n=Math.PI/2+t/10*Math.PI*2,r=t%2?.42:1;e.push([Math.cos(n)*r,Math.sin(n)*r])}f(e,Math.round(130*i),20*a,2.3,6);break}case`crackle`:u(Math.round(120*i),18*a,(e,i,a,o)=>{this.star(t,n,r,e*o,i*o,a*o,1.5+c()*.6,1.6,4.4,.42,re,L,.7,10,3,1.9),l++}),this.audio?.crackle(1.6)}let p=e.type===`willow`?L:e.type===`crackle`?re:o;this.flashes.push({x:t,y:n,z:r,r:p[0]*.7+.3,g:p[1]*.7+.3,b:p[2]*.7+.3,fast:2.6,slow:.75}),this.flashes.length>10&&this.flashes.shift();let m=3+Math.floor(c()*3);for(let e=0;e<m;e++){let e=c()*Math.PI*2,i=(2+c()*6)*a;this.puff(t+Math.cos(e)*i,n+Math.sin(e)*i*.7,r+(c()-.5)*6,6+c()*5,.13+c()*.08)}this.audio?.boom(.22+c()*.1,e.type===`willow`?.7:1),this.shells++,this.onBurst?.(e.type,l)}puff(e,t,n,r,i){this.puffs.length>=240&&this.puffs.shift(),this.puffs.push({x:e,y:t,z:n,vx:.35+Math.random()*.5,vy:.15+Math.random()*.25,age:0,life:14+Math.random()*8,size0:r*.45,size1:r*(1.5+Math.random()*.5),alpha:i,rot:Math.random()*6.28,spin:(Math.random()-.5)*.12,tile:Math.floor(Math.random()*4)})}tmp={x:0,y:0};step(e){let t=this.P,n=Math.random,r=this.max*.9;for(let t=this.rockets.length-1;t>=0;t--){let i=this.rockets[t],a=i.t;if(i.t+=e/i.dur,i.t<0)continue;if(a<0&&i.t>=0&&this.audio?.thump(),i.t>=1){this.rocketPos(i,1,this.tmp),this.burst(i,this.tmp.x,this.tmp.y,i.z),this.rockets.splice(t,1);continue}this.rocketPos(i,i.t,this.tmp);let o=(this.tmp.x-i.px)/Math.max(e,1e-4),s=(this.tmp.y-i.py)/Math.max(e,1e-4);for(i.acc+=e*(110-i.t*60);i.acc>=1&&this.n<r;){--i.acc;let e=n(),t=i.px+(this.tmp.x-i.px)*e,r=i.py+(this.tmp.y-i.py)*e;this.ember(t,r,i.z,o*.08+(n()-.5)*1.6,s*.05-1.5-n()*2,(n()-.5)*1.6,.45+n()*.6,2.6,3.5,.2+n()*.1,1,.62,.3,ve,1.5)}i.t>.05&&n()<e*2.2&&this.puff(this.tmp.x,this.tmp.y,i.z,2.2,.1),i.px=this.tmp.x,i.py=this.tmp.y}let i=0;for(;i<this.n;){let a=i*z,o=t[a+ie]+e;if(o>=t[a+K]||t[a+V]<.05){if(t[a+Q]&be&&t[a+V]>0){let e=t[a+B],r=t[a+V],i=t[a+H],o=3+Math.floor(n()*3);for(let t=0;t<o;t++)this.ember(e,r,i,(n()-.5)*9,(n()-.5)*9,(n()-.5)*9,.12+n()*.2,4,2,.24,1,1,1,_e,3.2)}this.n--,i!==this.n&&t.copyWithin(a,this.n*z,this.n*z+z);continue}t[a+ie]=o;let s=Math.exp(-t[a+ae]*e);t[a+U]=t[a+U]*s+.35*e,t[a+W]=t[a+W]*s-t[a+oe]*e,t[a+G]*=s,t[a+B]+=t[a+U]*e,t[a+V]+=t[a+W]*e,t[a+H]+=t[a+G]*e;let c=t[a+fe];if(c>0&&t[a+X]===he){let i=o/t[a+K],s=Math.min(1,Math.max(0,(r-this.n)/(r*.35))),l=t[a+pe]+c*e*(1-i*.6)*s;if(l>=1&&this.n<r){let r=(t[a+Q]&Se)!==0,o=i>t[a+de],s=o?t[a+ce]:t[a+q],c=o?t[a+le]:t[a+J],u=o?t[a+ue]:t[a+Y];for(;l>=1;){--l;let i=n()*e,o=t[a+B]-t[a+U]*i,d=t[a+V]-t[a+W]*i,f=t[a+H]-t[a+G]*i;r?this.ember(o,d,f,t[a+U]*.03+(n()-.5)*.15,t[a+W]*.03-.2,(n()-.5)*.15,2+n()*1,3,.9,.27,s,c,u,ye,1.15):this.ember(o,d,f,t[a+U]*.2+(n()-.5)*.5,t[a+W]*.2+(n()-.5)*.5,t[a+G]*.2,.35+n()*.35,3,2.5,.28,s,c,u,ge,1.1)}}t[a+pe]=l}i++}for(let t=this.flashes.length-1;t>=0;t--){let n=this.flashes[t];n.fast*=Math.exp(-e*7),n.slow*=Math.exp(-e*.9),n.fast+n.slow<.01&&this.flashes.splice(t,1)}for(let t=this.puffs.length-1;t>=0;t--){let n=this.puffs[t];n.age+=e,n.age>=n.life?this.puffs.splice(t,1):(n.x+=n.vx*e,n.y+=n.vy*e,n.vx+=(.6-n.vx)*e*.1,n.rot+=n.spin*e)}}writeOutputs(e){let t=this.P,n=this.outPos,r=this.outCol,i=this.outSize,a=0;for(let e=0;e<this.n;e++){let o=e*z,s=t[o+ie],c=s/t[o+K],l=t[o+X],u,d,f,p,m=t[o+se];if(l===he){let e=t[o+de],n=Math.min(1,Math.max(0,(c-e)/.08));if(u=t[o+q]+(t[o+ce]-t[o+q])*n,d=t[o+J]+(t[o+le]-t[o+J])*n,f=t[o+Y]+(t[o+ue]-t[o+Y])*n,c<.1){let e=1-c/.1;u+=(1-u)*e,d+=(1-d)*e,f+=(1-f)*e}if(c>.78){let e=(c-.78)/.22;u+=(R[0]-u)*e*.6,d+=(R[1]-d)*e*.6,f+=(R[2]-f)*e*.6}let r=c>.7?1-(c-.7)/.3:1;p=t[o+Z]*r*(c<.04?1.6:1),t[o+Q]&xe&&c>.25&&(p*=(s*11+t[o+me])%1<.45?1.5:.06),c>.82&&(p*=.55+.45*Math.random()),m*=1-.35*c}else if(l===_e)u=1,d=.95,f=.85,p=t[o+Z]*(1-c)*(1-c);else{let e=Math.min(1,l===ye?c*.8:c*1.3);u=t[o+q]+(R[0]-t[o+q])*e,d=t[o+J]+(R[1]-t[o+J])*e,f=t[o+Y]+(R[2]-t[o+Y])*e;let n=1-c;p=t[o+Z]*n*Math.sqrt(n),l===ye?p=t[o+Z]*n**.8*(Math.random()<.12?2.4:.8):l===ve&&(p*=Math.random()<.3?2.2:.55),m*=.6+.4*n}n[a*3]=t[o+B],n[a*3+1]=t[o+V],n[a*3+2]=t[o+H],r[a*3]=u*p,r[a*3+1]=d*p,r[a*3+2]=f*p,i[a]=m,a++}for(let t of this.rockets){if(t.t<0||a>=this.max+64)continue;let o=.75+.25*Math.sin(e*60+t.seed);n[a*3]=t.px,n[a*3+1]=t.py,n[a*3+2]=t.z,r[a*3]=2.6*o,r[a*3+1]=1.9*o,r[a*3+2]=1.1*o,i[a]=.55,a++}this.outCount=a}writeSmoke(){let e=this.flashes,t=0;for(let n of this.puffs){let r=n.age/n.life,i=n.size0+(n.size1-n.size0)*(1-(1-r)*(1-r)),a=n.alpha*Math.min(1,n.age/1.2)*(1-r)*(1-r),o=.018,s=.02,c=.035,l=Math.max(0,1-n.y/30);o+=.05*l,s+=.028*l,c+=.03*l;for(let t of e){let e=n.x-t.x,r=n.y-t.y,i=n.z-t.z,a=(t.fast+t.slow)/(1+(e*e+r*r+i*i)/160);o+=t.r*a*.07,s+=t.g*a*.07,c+=t.b*a*.07}this.smokePos[t*3]=n.x,this.smokePos[t*3+1]=n.y,this.smokePos[t*3+2]=n.z,this.smokeCol[t*4]=o,this.smokeCol[t*4+1]=s,this.smokeCol[t*4+2]=c,this.smokeCol[t*4+3]=a,this.smokeSize[t*3]=i,this.smokeSize[t*3+1]=n.rot,this.smokeSize[t*3+2]=n.tile,t++}this.smokeCount=t}topFlashes(e,t){e.length=0;for(let t of this.flashes)e.push(t);return e.sort((e,t)=>t.fast+t.slow-(e.fast+e.slow)),e.length>t&&(e.length=t),e}},we=class{ctx;noise;master;constructor(){this.ctx=new AudioContext;let e=this.ctx.sampleRate*2;this.noise=this.ctx.createBuffer(1,e,this.ctx.sampleRate);let t=this.noise.getChannelData(0);for(let n=0;n<e;n++)t[n]=Math.random()*2-1;this.master=this.ctx.createGain(),this.master.gain.value=.5;let n=this.ctx.createDynamicsCompressor();this.master.connect(n),n.connect(this.ctx.destination)}burstNoise(e,t,n,r,i,a,o=`lowpass`){let s=this.ctx.createBufferSource();s.buffer=this.noise;let c=this.ctx.createBiquadFilter();c.type=o,c.frequency.value=t,c.Q.value=n;let l=this.ctx.createGain();l.gain.setValueAtTime(1e-4,e),l.gain.exponentialRampToValueAtTime(r,e+i),l.gain.exponentialRampToValueAtTime(1e-4,e+i+a),s.connect(c),c.connect(l),l.connect(this.master),s.start(e,Math.random()*1.2),s.stop(e+i+a+.05)}boom(e,t){let n=this.ctx.currentTime+e;this.burstNoise(n,520+Math.random()*200,.7,.9*t,.006,1.4),this.burstNoise(n,120,1.2,.8*t,.01,.9)}crackle(e){let t=this.ctx.currentTime+e;for(let e=0;e<26;e++)this.burstNoise(t+Math.random()*.7,2500+Math.random()*3e3,1,.12+Math.random()*.12,.002,.04,`highpass`)}thump(){this.burstNoise(this.ctx.currentTime,260,1,.25,.004,.22)}},$=n(),Te=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,Ee=Te?14e3:3e4,De=Te?.7:1,Oe=-42,ke=-175,Ae=40,je=.62,Me=[[[0,0,.78]],[[0,-.6,.55],[0,.6,.55]],[[0,-.75,.42],[1,-.25,.62],[2,.25,.62],[3,.75,.42]],[[0,0,.92],[1.5,-.56,.52],[1.5,.56,.52]],[[0,-.35,.6],[.5,.35,.74]],[[0,.72,.5],[1,.25,.66],[2,-.25,.66],[3,-.72,.5]],[[0,-.5,.82],[.75,.5,.82],[1.5,0,.5]]],Ne=[`chrys`,`peony`,`crackle`,`ring`,`chrys`,`peony`],Pe=class{t=D?30.6:0;next=.25;last=-1;wall=!1;auto=!0;sel=`random`;view={xr:30,yMin:14,yMax:34};clicks=[];eng;constructor(e){this.eng=e}pick(e){if(this.sel!==`random`)return this.sel;let t=e??N.map(e=>e.id);return t[Math.floor(Math.random()*t.length)]}fire(e,t,n,r,i){let a=this.view,o=Math.min(1,Math.max(0,t));this.eng.launch(e*a.xr,a.yMin+o*(a.yMax-a.yMin),Oe+(Math.random()-.5)*10,n,r,i)}salvo(){let e=this.pick([`chrys`,`peony`,`crackle`,`ring`,`willow`]),t=Math.floor(Math.random()*I);for(let n=0;n<7;n++){let r=n/6;this.fire(-.85+1.7*r,.35+.5*Math.sin(Math.PI*r),e,(t+n%2*2)%I,Math.abs(n-3)*.09)}}update(e){if(!this.auto)return;this.t+=e,this.t>=Ae&&(this.t-=Ae,this.next=.3,this.wall=!1);let t=this.t,n=Math.random;if(t<30.5){if(t<this.next)return;let e=0;do e=Math.floor(n()*Me.length);while(e===this.last);this.last=e;let r=Me[e],i=this.pick(),a=this.sel===`random`&&n()<.4?this.pick():i,o=Math.floor(n()*I),s=(o+1+Math.floor(n()*(I-1)))%I,c=0;r.forEach(([e,t,l],u)=>{let d=r.some(([n,r],i)=>i!==u&&n===e&&Math.abs(r+t)<.01);this.fire(t+(n()-.5)*.08,l+(n()-.5)*.08,u%2?a:i,d||u%2==0?o:s,e*je),c=Math.max(c,e)}),this.next=t+(c+2.4+n()*1.4)*je}else if(t<36.4){if(t<this.next)return;this.fire((n()*2-1)*.92,.15+n()*.85,this.pick(Ne),Math.floor(n()*I),0),n()<.35&&this.fire((n()*2-1)*.92,.15+n()*.85,this.pick(Ne),Math.floor(n()*I),.05),this.next=t+.13+n()*.17}else if(!this.wall){this.wall=!0;let e=this.sel===`random`?`willow`:this.sel;for(let t=0;t<5;t++)this.fire(-.8+t*.4,.82+t%2*.1,e,3,t*.04)}}},Fe=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,Ie=`
uniform float uTime, uAspect, uBank, uS, uPx;
uniform vec4 uF0, uF1, uF2, uF3;
uniform vec3 uC0, uC1, uC2, uC3;
uniform sampler2D tRefl;
varying vec2 vUv;

float h11(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
vec3 L(vec3 c) { return c * c * (c * 0.305 + 0.682) + c * 0.0125; } // ~ sRGB → linear
float cov(float d) { return clamp(d / uPx + 0.5, 0.0, 1.0); }

vec3 glow(vec2 uv, vec4 F, vec3 C) {
  vec2 d = (uv - F.xy) * vec2(uAspect, 1.0);
  float r2 = dot(d, d) / (F.w * F.w);
  float k = F.z / (1.0 + F.z * 0.35);
  return C * k * (exp(-r2 * 1.6) * 0.045 + exp(-r2 * 0.15) * 0.012);
}
float lx(float x, vec4 F) { float d = (x - F.x) * uAspect / F.w; return F.z / (1.0 + F.z * 0.35) / (1.0 + d * d * 0.8); }

vec3 sky(vec2 uv) {
  float h = uv.y - uBank;
  vec3 c = mix(L(vec3(0.20, 0.10, 0.15)), L(vec3(0.06, 0.06, 0.13)), smoothstep(0.0, 0.2, h));
  c = mix(c, L(vec3(0.014, 0.016, 0.04)), smoothstep(0.15, 0.8, h));
  vec2 sp = vec2(uv.x * uAspect, uv.y) * 200.0;
  vec2 cell = floor(sp);
  float hs = h21(cell);
  if (hs > 0.992) {
    float d = length(fract(sp) - 0.5);
    float tw = 0.55 + 0.45 * sin(uTime * (1.0 + hs * 3.0) + hs * 80.0);
    c += vec3(0.55, 0.6, 0.8) * smoothstep(0.25, 0.0, d) * tw * smoothstep(0.1, 0.45, h);
  }
  c += glow(uv, uF0, uC0) + glow(uv, uF1, uC1) + glow(uv, uF2, uC2) + glow(uv, uF3, uC3);
  return c;
}

// q.x: horizontal in screen-height units, q.y: height above the waterline (screen-height units)
vec4 city(vec2 q, vec3 lit) {
  vec3 col = vec3(0.0);
  float a = 0.0;
  float s = uS;
  float emb = 0.007 * s;
  // embankment with a row of lamps
  if (q.y < emb) {
    col = L(vec3(0.035, 0.032, 0.045)) + lit * 0.006;
    a = 1.0;
    float lp = fract(q.x / (0.05 * s)) - 0.5;
    float lamp = exp(-(lp * lp * 2500.0 + pow((q.y - emb * 0.7) / s, 2.0) * 9e5));
    col += L(vec3(1.0, 0.68, 0.36)) * lamp * 1.6;
  }
  float y = q.y - emb;
  // far layer: hazy, bluish
  {
    float w = 0.026 * s;
    float id = floor(q.x / w);
    float r = h11(id);
    float h = (0.024 + 0.05 * r * r + step(0.9, r) * 0.05) * s;
    float fx = fract(q.x / w);
    float c = cov(min(h - y, min((fx - 0.06) * w, (0.97 - fx) * w))) * step(0.0, y);
    if (c > 0.0) {
      vec3 b = L(vec3(0.085, 0.085, 0.14)) + lit * 0.012;
      vec2 g = vec2(fx * 6.0, y / (0.0055 * s));
      vec2 cf = fract(g);
      float on = step(0.8, h21(floor(g) + id * 13.7)) * step(0.3, cf.x) * step(cf.x, 0.7) * step(0.3, cf.y) * step(cf.y, 0.72) * step(y, h - 0.004 * s);
      b += on * L(vec3(1.0, 0.8, 0.55)) * 0.28;
      col = mix(col, b, c);
      a = max(a, c);
    }
  }
  // near layer: darker, taller, warm windows
  {
    float w = 0.046 * s;
    float xx = q.x + 0.31;
    float id = floor(xx / w);
    float r = h11(id + 17.0);
    float h = (0.01 + 0.07 * r * r * r + step(0.86, r) * 0.045) * s;
    float fx = fract(xx / w);
    float tier = step(0.55, h11(id + 3.0)) * step(abs(fx - 0.5), 0.2) * 0.018 * s;
    float hh = h + tier;
    float c = cov(min(hh - y, min((fx - 0.04) * w, (0.985 - fx) * w))) * step(0.0, y);
    if (c > 0.0) {
      vec3 b = L(vec3(0.032, 0.032, 0.05)) + lit * (0.006 + 0.02 * smoothstep(0.0, hh, y));
      vec2 g = vec2(fx * 9.0, y / (0.0062 * s));
      vec2 cell = floor(g);
      vec2 cf = fract(g);
      float hw = h21(cell + id * 7.3);
      float on = step(0.72, hw) * step(0.25, cf.x) * step(cf.x, 0.75) * step(0.25, cf.y) * step(cf.y, 0.7) * step(y, h - 0.005 * s) * step(0.004 * s, y);
      vec3 wc = mix(L(vec3(1.0, 0.7, 0.4)), L(vec3(0.75, 0.86, 1.0)), step(0.88, hw));
      b += on * wc * (0.35 + 0.45 * h21(cell.yx + id));
      col = mix(col, b, c);
      a = max(a, c);
    }
  }
  // landmark tower with two pearls and a blinking beacon
  {
    float tx = (q.x - uAspect * 0.76) / s;
    float ty = y / s;
    float d = min(abs(tx) - 0.0032, 0.0) + max(abs(tx) - 0.0032, ty - 0.2);
    d = min(d, max(abs(tx) - (0.013 - ty * 0.17), ty - 0.07));
    d = min(d, length(vec2(tx, ty - 0.085)) - 0.012);
    d = min(d, length(vec2(tx, ty - 0.165)) - 0.008);
    d = min(d, max(abs(tx) - 0.0011, ty - 0.265));
    float c = cov(-d * s) * step(0.0, ty);
    if (c > 0.0) {
      float pearl = step(length(vec2(tx, ty - 0.085)), 0.013) + step(length(vec2(tx, ty - 0.165)), 0.009);
      vec3 b = L(vec3(0.05, 0.04, 0.07)) + lit * 0.02 + pearl * L(vec3(0.75, 0.22, 0.5)) * (0.12 + 0.06 * sin(uTime * 1.3 + ty * 40.0));
      col = mix(col, b, c);
      a = max(a, c);
    }
    vec2 bp = vec2(tx, ty - 0.268) * 900.0;
    float bea = exp(-dot(bp, bp)) * step(0.55, fract(uTime * 0.6));
    col += L(vec3(1.0, 0.12, 0.1)) * bea * 3.0;
    a = max(a, min(1.0, bea));
  }
  return vec4(col, a);
}

void main() {
  vec2 uv = vUv;
  bool water = uv.y < uBank;
  vec2 dist = vec2(0.0);
  float depth = 0.0;
  vec2 suv = uv;
  if (water) {
    depth = clamp((uBank - uv.y) / max(uBank, 1e-3), 0.0, 1.0);
    float persp = 1.0 / (depth + 0.03);
    vec2 wq = vec2((uv.x - 0.5) * uAspect * persp * 0.7, persp);
    float n = vnoise(wq * vec2(1.6, 1.1) + vec2(0.0, uTime * 0.8)) * 0.65 + vnoise(wq * vec2(4.6, 2.9) + vec2(uTime * 0.25, uTime * 1.6)) * 0.35 - 0.5;
    dist = vec2(n * (0.003 + 0.03 * depth), n * 0.006 * depth);
    suv = vec2(uv.x + dist.x, 2.0 * uBank - uv.y + dist.y);
  }
  float fx = suv.x;
  vec3 lit = uC0 * lx(fx, uF0) + uC1 * lx(fx, uF1) + uC2 * lx(fx, uF2) + uC3 * lx(fx, uF3);
  vec3 col = sky(suv);
  vec4 c = city(vec2(suv.x * uAspect, suv.y - uBank), lit);
  col = mix(col, c.rgb, c.a);
  if (water) {
    float refl = mix(0.55, 0.22, smoothstep(0.0, 0.8, depth));
    col *= refl;
    // firework reflections (mirrored particle pass), smeared vertically like wind-ruffled water
    vec2 ruv = uv + dist * vec2(1.4, 0.6);
    float sm = 0.003 + 0.016 * depth;
    vec3 pr = textureLod(tRefl, ruv, 0.0).rgb * 0.4
            + textureLod(tRefl, ruv + vec2(0.0, sm), 0.0).rgb * 0.25
            + textureLod(tRefl, ruv - vec2(0.0, sm), 0.0).rgb * 0.22
            + textureLod(tRefl, ruv + vec2(0.0, sm * 2.2), 0.0).rgb * 0.13;
    col += pr * (0.12 + refl * 0.85);
    // lamp glints stretched down the water
    float lp = fract(suv.x * uAspect / (0.05 * uS)) - 0.5;
    float brk = smoothstep(0.05, 0.3, dist.x / (0.003 + 0.03 * depth));
    float lq = lp - dist.x * uAspect / (0.05 * uS) * -0.6;
    col += L(vec3(1.0, 0.62, 0.3)) * exp(-lq * lq * 1600.0) * exp(-depth * 9.0) * 0.45 * brk;
    col += L(vec3(0.012, 0.016, 0.03)) + lit * 0.004 * (1.0 - depth);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,Le=`
attribute vec3 aCol;
attribute float aSize;
uniform float uScale, uMirror;
varying vec3 vCol;
void main() {
  vec3 p = position;
  p.y *= uMirror;
  // artistic: mirror squashed toward the waterline so high bursts still land on the visible river
  if (uMirror < 0.0) p.y *= 0.55;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = aSize * uScale / -mv.z;
  // sub-pixel points keep their energy instead of shimmering
  vCol = aCol * min(1.0, s / 2.0);
  gl_PointSize = max(s, 2.0);
}
`,Re=`
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 4.0) * 0.55 + exp(-d2 * 22.0);
  gl_FragColor = vec4(vCol * a, 1.0);
}
`,ze=`
attribute vec3 iPos;
attribute vec4 iCol;
attribute vec3 iSz;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSz.y), s = sin(iSz.y);
  mv.xy += mat2(c, s, -s, c) * position.xy * iSz.x;
  gl_Position = projectionMatrix * mv;
  vUv = (uv + vec2(mod(iSz.z, 2.0), floor(iSz.z / 2.0))) * 0.5;
  vCol = iCol;
}
`,Be=`
uniform sampler2D tSmoke;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  float a = texture2D(tSmoke, vUv).r * vCol.a;
  gl_FragColor = vec4(vCol.rgb * a, a);
}
`;function Ve(){let e=document.createElement(`canvas`);e.width=e.height=256;let t=e.getContext(`2d`);t.fillStyle=`#000`,t.fillRect(0,0,256,256),t.globalCompositeOperation=`lighter`;for(let e=0;e<4;e++){let n=e%2*128+64,r=Math.floor(e/2)*128+64;for(let e=0;e<22;e++){let e=Math.random()*Math.PI*2,i=Math.random()*26,a=n+Math.cos(e)*i,o=r+Math.sin(e)*i,s=14+Math.random()*26,c=t.createRadialGradient(a,o,0,a,o,s),l=.07+Math.random()*.09;c.addColorStop(0,`rgba(255,255,255,${l})`),c.addColorStop(1,`rgba(255,255,255,0)`),t.fillStyle=c,t.fillRect(n-64,r-64,128,128)}}let n=new v(e);return n.colorSpace=``,n}function He({eng:e,dir:t}){let n=g(e=>e.gl),r=g(e=>e.camera),i=g(e=>e.scene),c=(0,M.useMemo)(()=>{let t=new a,n=new d(e.outPos,3).setUsage(b),r=new d(e.outCol,3).setUsage(b),i=new d(e.outSize,1).setUsage(b);t.setAttribute(`position`,n),t.setAttribute(`aCol`,r),t.setAttribute(`aSize`,i),t.setDrawRange(0,0);let c=e=>({vertexShader:Le,fragmentShader:Re,uniforms:{uScale:{value:900},uMirror:{value:e}},transparent:!0,depthTest:!1,depthWrite:!1,blending:5,blendSrc:201,blendDst:201}),g=new p(c(1)),v=new p(c(-1)),S=new l(t,g);S.frustumCulled=!1,S.renderOrder=2;let w=new l(t,v);w.frustumCulled=!1;let E=new m;E.add(w);let D=new u(4,4,{type:_,depthBuffer:!1}),O=new p({vertexShader:Fe,fragmentShader:Ie,uniforms:{uTime:{value:0},uAspect:{value:1},uBank:{value:.3},uS:{value:1},uPx:{value:.001},uF0:{value:new h},uF1:{value:new h},uF2:{value:new h},uF3:{value:new h},uC0:{value:new T},uC1:{value:new T},uC2:{value:new T},uC3:{value:new T},tRefl:{value:D.texture}},depthTest:!1,depthWrite:!1}),te=new s(2,2),k=new C(te,O);k.frustumCulled=!1,k.renderOrder=-1;let A=new x,j=new s(1,1);A.index=j.index,A.setAttribute(`position`,j.getAttribute(`position`)),A.setAttribute(`uv`,j.getAttribute(`uv`));let M=new y(e.smokePos,3).setUsage(b),N=new y(e.smokeCol,4).setUsage(b),P=new y(e.smokeSize,3).setUsage(b);A.setAttribute(`iPos`,M),A.setAttribute(`iCol`,N),A.setAttribute(`iSz`,P),A.instanceCount=0;let F=Ve(),I=new p({vertexShader:ze,fragmentShader:Be,uniforms:{tSmoke:{value:F}},transparent:!0,depthTest:!1,depthWrite:!1,blending:5,blendSrc:201,blendDst:205}),L=new C(A,I);return L.frustumCulled=!1,L.renderOrder=1,{geo:t,aPos:n,aCol:r,aSize:i,ptMat:g,reflMat:v,points:S,reflScene:E,reflRT:D,bg:k,bgMat:O,bgGeo:te,sGeo:A,quad:j,iPos:M,iCol:N,iSz:P,sMat:I,smoke:L,tSmoke:F,buf:new ee,v:new T,ray:new f,plane:new o(new T(0,0,1),42),hit:new T,ndc:new ee,top:[]}},[e]);(0,M.useEffect)(()=>()=>{c.geo.dispose(),c.ptMat.dispose(),c.reflMat.dispose(),c.reflRT.dispose(),c.bgMat.dispose(),c.bgGeo.dispose(),c.sGeo.dispose(),c.quad.dispose(),c.sMat.dispose(),c.tSmoke.dispose()},[c]);let v=(0,M.useRef)(!1);(0,M.useEffect)(()=>{let e=!0,t=[c.points,c.bg,c.smoke],a=n.getRenderTarget();n.setRenderTarget(c.reflRT);let o=n.compileAsync(i,r),s=n.compileAsync(c.reflScene,r);return n.setRenderTarget(a),t.forEach(e=>e.visible=!1),Promise.all([o,s]).catch(()=>{}).then(()=>{e&&(v.current=!0,t.forEach(e=>e.visible=!0))}),()=>{e=!1}},[c,n,i,r]);let E=(0,M.useRef)({time:0,px:0});return S((i,a)=>{let o=Math.min(a,1/30),s=E.current;s.time+=o;let l=i.size,u=l.width/l.height,d=u<1?64:50;r.fov!==d&&(r.fov=d,r.updateProjectionMatrix()),s.px=w.damp(s.px,D?0:i.pointer.x,1.5,o),r.position.set(s.px*1.2,3.2,20),r.lookAt(s.px*.6,10,Oe),r.updateMatrixWorld();let f=(e,t)=>(c.ray.setFromCamera(c.ndc.set(e,t),r),c.ray.ray.intersectPlane(c.plane,c.hit),c.hit),p=Math.abs(f(1,.3).x),m=f(0,.84).y;for(e.scale=w.clamp(p/34,.55,1),t.view.xr=p*.72,t.view.yMin=Math.max(13,f(0,-.05).y+8*e.scale),t.view.yMax=Math.max(t.view.yMin+4,m-13*e.scale);t.clicks.length;){let n=t.clicks.shift(),r=f(n.x,n.y),i=w.clamp(r.x,-p*.92,p*.92),a=w.clamp(r.y,t.view.yMin*.8,t.view.yMax+4);e.launch(i,a,Oe,t.pick())}t.update(o),e.step(o),e.writeOutputs(s.time),e.writeSmoke();let h=e.outCount;c.geo.setDrawRange(0,h);for(let[e,t]of[[c.aPos,3],[c.aCol,3],[c.aSize,1]])e.clearUpdateRanges(),e.addUpdateRange(0,Math.max(1,h*t)),e.needsUpdate=!0;let g=e.smokeCount;c.sGeo.instanceCount=g;for(let[e,t]of[[c.iPos,3],[c.iCol,4],[c.iSz,3]])e.clearUpdateRanges(),e.addUpdateRange(0,Math.max(1,g*t)),e.needsUpdate=!0;n.getDrawingBufferSize(c.buf);let _=Math.tan(w.degToRad(d/2));c.ptMat.uniforms.uScale.value=c.buf.y/(2*_);let y=c.bgMat.uniforms;y.uTime.value=s.time,y.uAspect.value=u,y.uPx.value=1/c.buf.y,y.uS.value=Math.tan(w.degToRad(25))/_,c.v.set(0,0,ke).project(r),y.uBank.value=c.v.y*.5+.5;let b=e.topFlashes(c.top,4),x=[`uF0`,`uF1`,`uF2`,`uF3`],S=[`uC0`,`uC1`,`uC2`,`uC3`];for(let t=0;t<4;t++){let n=y[x[t]].value,i=y[S[t]].value,a=b[t];a?(c.v.set(a.x,a.y,a.z).project(r),n.set(c.v.x*.5+.5,c.v.y*.5+.5,a.fast+a.slow,18*e.scale/(Math.abs(a.z-r.position.z)*2*_)),i.set(a.r,a.g,a.b)):n.set(0,0,0,.2)}let ee=Math.max(2,Math.round(c.buf.x*.5)),C=Math.max(2,Math.round(c.buf.y*.5));if((c.reflRT.width!==ee||c.reflRT.height!==C)&&c.reflRT.setSize(ee,C),c.reflMat.uniforms.uScale.value=C/(2*_),!v.current)return;let T=n.getRenderTarget();n.setRenderTarget(c.reflRT),n.setClearColor(0,1),n.clear(!0,!1,!1),n.render(c.reflScene,r),n.setRenderTarget(T)}),(0,$.jsxs)($.Fragment,{children:[(0,$.jsx)(`primitive`,{object:c.bg}),(0,$.jsx)(`primitive`,{object:c.smoke}),(0,$.jsx)(`primitive`,{object:c.points})]})}function Ue(){let e=(0,M.useMemo)(()=>new Ce(Ee,De),[]),t=(0,M.useMemo)(()=>new Pe(e),[e]),[n,a]=(0,M.useState)(!0),[o,s]=(0,M.useState)(`random`),[c,l]=(0,M.useState)(!1),[u,d]=(0,M.useState)({type:`chrys`,stars:130,n:0}),[f,p]=(0,M.useState)(Te?1.5:1.75),m=(0,M.useRef)(null),h=(0,M.useRef)(0);(0,M.useEffect)(()=>{t.auto=n},[n,t]),(0,M.useEffect)(()=>{t.sel=o},[o,t]),(0,M.useEffect)(()=>(e.onBurst=(t,n)=>{let r=performance.now();r-h.current<1400||(h.current=r,d({type:t,stars:n,n:e.shells}))},()=>{e.onBurst=null}),[e]),(0,M.useEffect)(()=>{c?(m.current||=new we,m.current.ctx.resume(),e.audio=m.current):(e.audio=null,m.current?.ctx.suspend())},[c,e]),(0,M.useEffect)(()=>()=>void m.current?.ctx.close(),[]);let g=e=>{let n=e.currentTarget.getBoundingClientRect();t.clicks.push({x:(e.clientX-n.left)/n.width*2-1,y:-((e.clientY-n.top)/n.height*2-1)})},_=N.find(e=>e.id===u.type),v=[{value:`random`,label:`随机`},...N.map(e=>({value:e.id,label:e.zh}))],y=(0,$.jsxs)(`button`,{className:`seg`,"aria-pressed":n,onClick:()=>a(e=>!e),children:[n&&(0,$.jsx)(`span`,{className:`seg-bg`}),(0,$.jsxs)(`span`,{children:[(0,$.jsx)(`i`,{className:`fw-dot`,"data-on":n}),`自动表演`]})]}),b=(0,$.jsx)(`button`,{className:`seg fw-salvo`,onClick:()=>t.salvo(),children:(0,$.jsx)(`span`,{children:`齐射`})}),x=(0,$.jsxs)(`button`,{className:`seg`,"aria-pressed":c,onClick:()=>l(e=>!e),children:[c&&(0,$.jsx)(`span`,{className:`seg-bg`}),(0,$.jsx)(`span`,{children:c?`声音 · 开`:`声音 · 关`})]});return(0,$.jsxs)(`div`,{className:`stage fw`,style:{background:`#05060d`},children:[(0,$.jsx)(`style`,{children:We}),(0,$.jsx)(`div`,{className:`fw-canvas`,onPointerDown:g,children:(0,$.jsxs)(E,{dpr:f,flat:!0,gl:{antialias:!1,alpha:!1,powerPreference:`high-performance`},camera:{position:[0,3.2,20],fov:50,near:.5,far:600},onCreated:({gl:e})=>e.setClearColor(`#05060d`,1),children:[(0,$.jsx)(A,{onDecline:()=>p(e=>Math.max(1,e*.8)),flipflops:3}),(0,$.jsx)(He,{eng:e,dir:t}),(0,$.jsx)(te,{multisampling:0,children:(0,$.jsx)(k,{mipmapBlur:!0,intensity:1.15,luminanceThreshold:.42,luminanceSmoothing:.3,radius:.72})})]})}),(0,$.jsxs)(`div`,{className:`overlay fw-overlay`,children:[(0,$.jsx)(`div`,{className:`fw-label soft-text`,children:(0,$.jsx)(j,{id:`${u.type}-${u.n}`,meta:`SHELL ${String(u.n).padStart(3,`0`)} · ${u.stars} STARS · ${(Ee/1e3).toFixed(0)}K POOL`,title:_.zh,sub:_.en,aside:_.aside})}),(0,$.jsx)(i,{children:!n&&(0,$.jsx)(r.p,{className:`fw-paused`,initial:{opacity:0,y:6},animate:{opacity:1,y:0},exit:{opacity:0,y:6},children:`自动表演已暂停 · 点击夜空自己放`})}),Te?(0,$.jsxs)($.Fragment,{children:[(0,$.jsx)(`div`,{className:`dock fw-dock-types`,children:(0,$.jsx)(O,{items:v,value:o,onChange:s})}),(0,$.jsxs)(`div`,{className:`dock`,children:[y,b,x]})]}):(0,$.jsxs)(`div`,{className:`dock`,children:[y,(0,$.jsx)(`span`,{className:`dock-sep`}),(0,$.jsx)(O,{items:v,value:o,onChange:s}),(0,$.jsx)(`span`,{className:`dock-sep`}),b,x]}),(0,$.jsxs)(`p`,{className:`hint`,children:[`点击夜空 · 朝那里发射`,(0,$.jsx)(`br`,{}),`每 40 秒一轮压轴`]})]})]})}var We=`
.fw-canvas { position: absolute; inset: 0; touch-action: none; cursor: crosshair; }
.fw-label { --soft-bg: #05060d; }
.fw-label .big-label-meta { font-size: 11px; letter-spacing: .1em; }
.fw-dot { display: inline-block; width: 6px; height: 6px; margin-right: 7px; border-radius: 50%; vertical-align: 1px; background: rgba(255,255,255,.3); transition: background .3s, box-shadow .3s; }
.fw-dot[data-on='true'] { background: #ffcf5a; box-shadow: 0 0 10px #ffcf5a; }
.fw-salvo span { color: #ffd88a; }
.fw-salvo:active { transform: scale(.96); }
.fw-paused {
  position: absolute; left: 50%; bottom: 74px; transform: translateX(-50%); margin: 0;
  font: 500 12px/1 var(--mono); letter-spacing: .06em; color: var(--fg-2); white-space: nowrap; pointer-events: none !important;
}
@media (max-width: 760px) {
  .fw-dock-types { bottom: 72px; }
  .fw .big-label { bottom: 132px; }
  .fw-label .big-label p span { display: none; }
  .fw-label .big-label-meta { font-size: 10px; }
  .fw-paused { bottom: 122px; }
  .fw .dock .seg { padding: 0 11px; }
}
`;export{Ue as default};