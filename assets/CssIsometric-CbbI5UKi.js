import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{c as r,n as i,o as a,s as o}from"./index-gQ65n0JU.js";var s=e(t(),1);function c(){!o.current&&a();let[e]=(0,s.useState)(r.current);return e}var l=n(),u={type:`spring`,stiffness:110,damping:18,mass:.9},d=[{id:`rev`,area:`1 / 1 / 2 / 3`,title:`本周营收`,tone:`#3b6cf6`,body:(0,l.jsxs)(`div`,{className:`iso-chart`,children:[[38,62,48,80,56,92,70].map((e,t)=>(0,l.jsx)(`i`,{style:{height:`${e}%`,opacity:t===5?1:.35+t*.06}},t)),(0,l.jsx)(`b`,{className:`float`,style:{left:`68%`,bottom:`92%`},children:`¥ 128,400`})]})},{id:`user`,area:`1 / 3 / 2 / 4`,title:`活跃用户`,tone:`#ff6b4a`,body:(0,l.jsxs)(`div`,{className:`iso-kpi`,children:[(0,l.jsx)(`strong`,{children:`24.8k`}),(0,l.jsx)(`span`,{children:`+12.4%`}),(0,l.jsx)(`div`,{className:`ring float`})]})},{id:`team`,area:`2 / 1 / 3 / 2`,title:`团队`,tone:`#3f9a72`,body:(0,l.jsx)(`div`,{className:`iso-avatars`,children:[`#ffb36b`,`#6b8cff`,`#3fd2c7`,`#ff7bd5`].map((e,t)=>(0,l.jsx)(`i`,{className:`float`,style:{background:e,transitionDelay:`${t*40}ms`}},e))})},{id:`tasks`,area:`2 / 2 / 4 / 3`,title:`任务`,tone:`#7b68d8`,body:(0,l.jsx)(`ul`,{className:`iso-list`,children:[`设计评审`,`粒子性能优化`,`等距插画`,`发布 v2.0`,`写周报`].map((e,t)=>(0,l.jsxs)(`li`,{className:t===1?`float`:``,children:[(0,l.jsx)(`i`,{"data-done":t>2}),e]},e))})},{id:`map`,area:`2 / 3 / 3 / 4`,title:`地区分布`,tone:`#f2c46d`,body:(0,l.jsx)(`div`,{className:`iso-dots`,children:Array.from({length:24},(e,t)=>(0,l.jsx)(`i`,{className:t===9||t===14?`float`:``,style:{opacity:[.2,.5,1][t*7%3]}},t))})},{id:`cta`,area:`3 / 1 / 4 / 2`,title:`升级`,tone:`#1d1c1a`,body:(0,l.jsxs)(`div`,{className:`iso-cta`,children:[(0,l.jsx)(`span`,{className:`float`,children:`Pro`}),(0,l.jsx)(`p`,{children:`解锁全部 3D 组件`})]})},{id:`log`,area:`3 / 3 / 4 / 4`,title:`部署`,tone:`#3fd2c7`,body:(0,l.jsxs)(`div`,{className:`iso-log`,children:[(0,l.jsx)(`code`,{children:`✓ build 14.2s`}),(0,l.jsx)(`code`,{children:`✓ test 238 passed`}),(0,l.jsx)(`code`,{className:`float`,children:`→ deploying…`})]})}];function f(){let[e,t]=(0,s.useState)(!1),[n,r]=(0,s.useState)(null),a=c(),[o,f]=(0,s.useState)(!1),p=typeof window<`u`&&window.innerWidth>=760?-Math.min(window.innerWidth*.13,190):0;return(0,s.useEffect)(()=>{let e=setTimeout(()=>f(!0),1400);return()=>clearTimeout(e)},[]),(0,l.jsxs)(`div`,{className:`stage iso-css-stage`,children:[(0,l.jsx)(`div`,{className:`iso-viewport`,children:(0,l.jsx)(i.div,{className:`iso-plane`,"data-flat":e,initial:!a&&{rotateX:55,rotateZ:-45,scale:.7,opacity:0},animate:e?{rotateX:0,rotateZ:0,scale:1,opacity:1,x:p}:{rotateX:55,rotateZ:-45,scale:.86,opacity:1,x:0},transition:u,children:d.map((t,s)=>(0,l.jsxs)(i.article,{className:`iso-card`,style:{gridArea:t.area,"--tone":t.tone},initial:!a&&{z:260,opacity:0},animate:{z:!e&&n===t.id?46:0,opacity:1},transition:{...u,delay:o?0:.25+s*.07},onHoverStart:()=>r(t.id),onHoverEnd:()=>r(e=>e===t.id?null:e),"data-hover":n===t.id,children:[(0,l.jsxs)(`header`,{children:[(0,l.jsx)(`i`,{}),t.title]}),t.body]},t.id))})}),(0,l.jsxs)(`div`,{className:`overlay`,children:[(0,l.jsxs)(i.div,{className:`hero-copy`,style:{pointerEvents:`none`},initial:{opacity:0,x:-12},animate:{opacity:+!e,x:0},transition:{duration:.5,ease:[.23,1,.32,1]},children:[(0,l.jsx)(`div`,{className:`scrim`}),(0,l.jsxs)(`p`,{className:`kicker`,children:[(0,l.jsx)(`i`,{style:{background:`#3b6cf6`}}),` CSS 3D · No WebGL`]}),(0,l.jsxs)(`h1`,{children:[`界面本身`,(0,l.jsx)(`br`,{}),`就是插画`]}),(0,l.jsx)(`p`,{children:`普通的 CSS Grid 仪表盘，倾斜成等距平面。悬停的卡片沿 Z 轴抬起，里面的元素再各自浮起一层。`})]}),(0,l.jsxs)(`div`,{className:`dock`,children:[(0,l.jsxs)(`button`,{className:`seg`,"aria-pressed":!e,onClick:()=>t(!1),children:[!e&&(0,l.jsx)(i.span,{layoutId:`css-iso-seg`,className:`seg-bg`,transition:{type:`spring`,stiffness:520,damping:40}}),(0,l.jsx)(`span`,{children:`等距`})]}),(0,l.jsxs)(`button`,{className:`seg`,"aria-pressed":e,onClick:()=>t(!0),children:[e&&(0,l.jsx)(i.span,{layoutId:`css-iso-seg`,className:`seg-bg`,transition:{type:`spring`,stiffness:520,damping:40}}),(0,l.jsx)(`span`,{children:`展平`})]})]})]}),(0,l.jsx)(`style`,{children:`
        .iso-css-stage { background: radial-gradient(110% 90% at 60% 40%, #f7f8fb 0%, #e6eaf2 100%); }
        .iso-css-stage .scrim { --soft-bg: #eef1f6; }
        .iso-viewport { position: absolute; inset: 0; display: grid; place-items: center; perspective: 2400px;
          padding-left: min(26vw, 380px); }
        @media (max-width: 760px) { .iso-viewport { padding-left: 0; place-items: start center; padding-top: 80px; } }
        .iso-plane { width: 760px; height: 600px; display: grid; gap: 22px; grid-template-columns: 1.15fr 1fr 1fr;
          grid-template-rows: 1fr 1fr 0.9fr; transform-style: preserve-3d; }
        @media (max-width: 760px) { .iso-plane { width: 520px; height: 440px; gap: 14px; zoom: 0.68; } }
        .iso-card { position: relative; padding: 18px 18px 16px; border-radius: 18px; background: #fff;
          transform-style: preserve-3d; color: #1d1c1a; display: flex; flex-direction: column; min-width: 0;
          box-shadow: 0 1px 0 rgba(0,0,0,.04), 0 0 0 1px rgba(29,28,26,.06), 14px 14px 0 -4px rgba(40,50,80,.08);
          transition: box-shadow .4s var(--ease-out); }
        .iso-card[data-hover='true'] { box-shadow: 0 0 0 1px rgba(29,28,26,.06), 46px 46px 40px -8px rgba(40,50,80,.22); }
        .iso-plane[data-flat='true'] .iso-card { box-shadow: 0 1px 0 rgba(0,0,0,.04), 0 0 0 1px rgba(29,28,26,.06), 0 12px 24px -16px rgba(40,50,80,.3); }
        .iso-card header { display: flex; align-items: center; gap: 8px; font: 600 13px/1 var(--sans); color: #57534c; }
        .iso-card header i { width: 8px; height: 8px; border-radius: 3px; background: var(--tone); }
        .iso-card .float { transform: translateZ(0); transition: transform .5s var(--ease-out); }
        .iso-card[data-hover='true'] .float { transform: translateZ(34px); }
        .iso-plane[data-flat='true'] .float { transform: none !important; }

        .iso-chart { position: relative; flex: 1; display: flex; align-items: flex-end; gap: 10px; margin-top: 18px;
          transform-style: preserve-3d; }
        .iso-chart i { flex: 1; border-radius: 6px 6px 3px 3px; background: var(--tone); }
        .iso-chart b { position: absolute; padding: 6px 10px; border-radius: 8px; background: #1d1c1a; color: #fff;
          font: 600 12px/1 var(--mono); white-space: nowrap; transform-origin: bottom; }
        .iso-kpi { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; position: relative; transform-style: preserve-3d; }
        .iso-kpi strong { font: 600 40px/1 var(--display); letter-spacing: -.03em; }
        .iso-kpi span { margin-top: 6px; font: 600 12px var(--mono); color: #3f9a72; }
        .iso-kpi .ring { position: absolute; right: 0; top: 4px; width: 64px; height: 64px; border-radius: 50%;
          background: conic-gradient(var(--tone) 0 72%, #f1ece6 0); -webkit-mask: radial-gradient(circle, transparent 52%, #000 54%); mask: radial-gradient(circle, transparent 52%, #000 54%); }
        .iso-avatars { flex: 1; display: flex; align-items: center; transform-style: preserve-3d; }
        .iso-avatars i { width: 40px; height: 40px; margin-right: -10px; border-radius: 50%; box-shadow: 0 0 0 3px #fff; }
        .iso-list { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 8px; transform-style: preserve-3d; }
        .iso-list li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px;
          background: #f5f3f8; font-size: 13px; }
        .iso-list li.float { background: var(--tone); color: #fff; }
        .iso-list li i { width: 14px; height: 14px; border-radius: 5px; box-shadow: inset 0 0 0 1.5px currentColor; opacity: .5; }
        .iso-list li i[data-done='true'] { background: currentColor; opacity: .3; }
        .iso-dots { flex: 1; display: grid; grid-template-columns: repeat(8, 1fr); align-content: center; gap: 8px;
          margin-top: 10px; transform-style: preserve-3d; }
        .iso-dots i { aspect-ratio: 1; border-radius: 50%; background: var(--tone); }
        .iso-cta { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; transform-style: preserve-3d; }
        .iso-cta span { align-self: flex-start; padding: 8px 14px; border-radius: 999px; background: #1d1c1a; color: #fff;
          font: 600 14px/1 var(--display); }
        .iso-cta p { margin: 10px 0 0; font-size: 13px; color: #57534c; }
        .iso-log { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; transform-style: preserve-3d; }
        .iso-log code { padding: 6px 10px; border-radius: 8px; background: #f2f6f6; font: 12px var(--mono); color: #3f5d5a; }
        .iso-log code.float { background: #1d1c1a; color: #8be0d6; }
      `})]})}export{f as default};