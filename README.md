# Motion 3D Lab

在线浏览：https://qiuyedx.github.io/motion-3d-lab/

用 React 19 · three.js（@react-three/fiber + drei）· Motion 写的 3D 创意小样合集，用来给产品页、首页、Landing 页找主视觉和“配菜”。

```bash
pnpm install
pnpm dev      # http://localhost:5196（端口被占时用 PORT 环境变量指定）
pnpm build
```

发布到 GitHub Pages：`pnpm deploy:pages`。脚本以 `/motion-3d-lab/` 为 base 构建，并把 `dist/` 强推到 `gh-pages` 分支（Pages 设置为“从分支部署”，不消耗 Actions 额度）。

目录页按三组列出全部 demo；进入 demo 后 `Esc` 返回目录，`Alt + ← / →` 切换上一个 / 下一个。

## Demo 一览（51 个，四组）

| 组 | Demo | 要点 |
|---|---|---|
| 等距 | 漂浮岛屿 `iso-isle` | 正交相机、阴影、Motion 弹簧驱动可旋转的桥；小人沿路径行走，桥对齐时过桥 |
| 等距 | 不可能三角 `iso-impossible` | 彭罗斯三角：锁定等距视角时切换为画家算法，拖动后弹回吸附 |
| 等距 | 方块阵列 `iso-field` | 2304 根 InstancedMesh 柱体，多个高度场按权重平滑切换，指针隆起 |
| 等距 | 分层堆叠 `iso-stack` | 产品架构分层图，展开 / 收拢循环，列表与层板双向悬停联动 |
| 等距 | 等距小镇 `iso-town` | 地块对角线波浪升起、小车绕行、昼夜切换与窗灯、点击建筑弹跳 |
| 等距 | 网络拓扑 `iso-network` | 节点 + L 形管线 + 数据包，点击节点逐跳广播；正常 / 高负载 / 故障改道 |
| 等距 | 剖面小屋 `iso-room` | 切开两面墙的工作室：窗光投影随时间移动、台灯、显示器、猫、植物可交互 |
| 等距 | 等距图表 `iso-chart` | 柱状 / 面积 / 环形三种立体图表，换数据逐根弹性生长，悬停提示 |
| 等距 | 等距水池 `iso-pool` | GPU 高度场水面 + 折射与焦散，点击 / 拖动起涟漪，雨滴、起风、跳水 |
| 等距 | 无限楼梯 `iso-stairs` | 彭罗斯阶梯：等距锁定时把起始段抬升一圈，把断口藏进远离镜头的那一段，小人永远向上 |
| 等距 | 地图编辑器 `iso-builder` | 点格子放道路 / 房屋 / 树 / 水，道路与河岸自动拼接，撤销、清空、一键生成小镇 |
| 等距 | 流水线工厂 `iso-factory` | 传送带穿过冲压、喷漆、装箱、贴标，点机器加速或故障，CI/CD 隐喻 |
| 等距 | 折叠城市 `iso-fold` | 盗梦空间式街区翻折，拖动控制折叠角度，车辆照常行驶 |
| 等距 | 解锁小岛 `iso-onboarding` | 游戏化引导：勾选清单逐个解锁建筑，全部完成点亮灯塔、放烟花 |
| 等距 | 地铁线路 `iso-metro` | 五条线路分层高架交汇，列车按时刻表运行，点站点看换乘与下一班倒计时 |
| 粒子 | 形态流转 `particle-morph` | 4.2 万粒子 GPU 变形：球、环面结、双螺旋、马鞍面、晶格、莫比乌斯带、星系 |
| 粒子 | 波动平面 `particle-plane` | 同一张 (u, v) 网格在涟漪、干涉、螺旋面、圆筒、球、环面之间卷起 / 展开 |
| 粒子 | 几何骨架 `particle-lattice` | 粒子沿柏拉图多面体棱线流动，外层与内层对偶体一起变形 |
| 粒子 | 奇异吸引子 `particle-attractor` | Lorenz / Aizawa / Thomas / Halvorsen / Rössler 实时 RK2 积分 |
| 粒子 | 粒子文字 `particle-type` | Canvas 采样文字为目标点，散成球壳再重组，可输入自定义文字 |
| 粒子 | GPGPU 流场 `particle-flow` | GPUComputationRenderer，26 万粒子旋度噪声流场，吸引 / 排斥 / 旋涡力源 |
| 粒子 | 点阵地球 `particle-globe` | 手绘大陆遮罩的点阵球、城市脉冲、大圆弧飞线、拖拽惯性与区域视角 |
| 粒子 | 体素重组 `particle-voxel` | 数千体素按高度排序拆散、翻滚飞行、落位回弹，五种形体 |
| 粒子 | 声音可视化 `particle-audio` | Web Audio 合成示例音乐或麦克风，FFT 驱动球体 / 圆环 / 频谱地形，鼓点冲击波 |
| 粒子 | 粒子沙漏 `particle-hourglass` | Worker 里的颗粒物理，点击翻转，颈口粗细与沙色可调，实时倒计时 |
| 粒子 | 百万粒子 `particle-webgpu` | 原生 WebGPU 计算着色器驱动 100 万粒子，不支持时退回 WebGL 26 万粒子 |
| 粒子 | 鸟群 `particle-boids` | 1.6 万只 GPU boids，网格邻域近似，鼠标是捕食的鹰 |
| 材质 | 玻璃折射 `shader-glass` | MeshTransmissionMaterial 折射身后的标题，清透 / 磨砂 / 色散预设 |
| 材质 | AI 光球 `shader-orb` | 噪声位移 + 薄膜虹彩，待机 / 聆听 / 思考 / 回答四态弹簧切换 |
| 材质 | 渐变网格 `shader-gradient` | 全屏域扭曲渐变 + 颗粒，四套配色平滑过渡，叠加 Hero 样例 |
| 材质 | 流光丝带 `shader-ribbon` | GPU 构建的丝带曲面，各向异性高光与背面着色，三套配色 |
| 材质 | 流体墨水 `shader-fluid` | 稳定流体模拟，霓虹 / 水墨（宣纸、飞白）/ 极光三种画风 |
| 材质 | 全息卡片 `shader-holo` | 镭射箔 + 闪粉着色器的会员卡，随指针倾斜变色，点击翻面 |
| 材质 | 熔岩融球 `shader-metaballs` | 光线步进熔岩灯，平滑并集的蜡团分裂融合，指针拉出液滴 |
| 材质 | 雨窗 `shader-rain` | 雨滴折射倒置的清晰城市，玻璃其余部分虚焦；拖动擦出清晰区域 |
| 材质 | 黄昏海面 `shader-ocean` | 8 组 Gerstner 波 + 菲涅尔天空反射与日光带，小船随浪起伏 |
| 材质 | 半调印刷 `shader-halftone` | 3D 场景实时转 CMYK 网点 / Riso 双色 / 单色报纸，可调网点与套印错位 |
| 实验 | 滚动叙事 `lab-scroll` | `useScroll` → `useSpring` → `useFrame`，关键帧驱动产品盒拆解与重组 |
| 实验 | CSS 等距界面 `lab-css-iso` | 不用 WebGL，CSS 3D 把仪表盘倾斜成等距平面，可一键展平 |
| 实验 | 景深卡片 `lab-tilt` | 多层 `translateZ` + 弹簧倾斜 + 指针高光 |
| 实验 | 物理堆叠 `lab-physics` | Rapier 刚体落成 BUILD，拖拽抛掷、推倒、月面重力 |
| 实验 | 翻牌屏 `lab-flap` | 机场翻牌屏：实例化翻片 + 字形图集，换词逐列错落翻动，可输入 |
| 实验 | 曲速隧道 `lab-tunnel` | 按住进入曲速：速度 / FOV / 拖尾 / 色差各自弹簧；Bloom + 色差后期 |
| 实验 | 折纸成盒 `lab-origami` | 铰链树结构的展开图逐面折起成立方体 / 三棱柱 / 金字塔，可拖动擦洗进度 |
| 实验 | 风中旗帜 `lab-cloth` | Verlet 布料旗帜，风力切换、抓取拖拽、剪断旗角再弹簧挂回 |
| 实验 | 滚动时间轴 `lab-timeline` | 等距小路随滚动前进，七个里程碑的小模型依次升起 |
| 实验 | 棱镜分光 `lab-prism` | 40 个波长的斯涅尔折射 + 色散 + 全内反射，拖动光源 |
| 实验 | 碎裂重组 `lab-shatter` | Voronoi 碎片 + Rapier 刚体飞散，再沿曲线拼回 |
| 实验 | 产品配置器 `lab-config` | 程序化耳机，配色 / 材质切换，爆炸视图与引线标注 |
| 实验 | 幕布揭晓 `lab-curtain` | Verlet 布料盖住新品，一阵风吹走露出产品，可重新盖上 |
| 实验 | 多米诺 `lab-domino` | 417 块骨牌走螺旋、楼梯、分叉，最后倒出一颗心，镜头跟随波前 |

## 结构

```
src/
  App.tsx                 hash 路由 + AnimatePresence 页面切换
  components/             Home 目录、DemoPage 外壳、Seg（layoutId 分段控件）、BigLabel
  demos/registry.ts       所有 demo 的元数据（新增 demo 只需在这里登记）
  demos/iso|particles|lab 各 demo
  lib/iso.tsx             IsoRig：正交等距相机，按视口适配缩放并用 setViewOffset 给文案让位
  lib/MorphCloud.tsx      通用粒子变形组件：Motion 管进度，Shader 管逐粒子延迟与扰动
  lib/shapes.ts           点云生成器（球、环面结、螺旋、马鞍、晶格、星系、莫比乌斯、文字采样）
  lib/fit.ts              竖屏下缩小居中场景
public/posters/           目录卡片封面（由下方脚本截取）
```

### 卡片 ↔ demo 的共享元素转场

- 用浏览器原生 View Transition API：`src/lib/router.ts` 在 `hashchange` 时调用 `document.startViewTransition(() => flushSync(setRoute))`。
- 进入：被点击卡片的封面区域临时命名为 `demo-stage`，demo 页根节点同名，浏览器把 16:10 的封面放大成整页；demo 页先盖一张同款封面（`.demo-poster`），场景首帧画好后再淡出，所以不会落到空白画布上。
- 返回：记住来源 demo 和目录滚动位置，Home 在同一次提交里恢复滚动并给那张卡命名，整页缩回卡片。
- 不支持 View Transition 或开启“减少动态效果”时，退回到 Motion 的淡入淡出。

### Motion 与 three.js 的配合方式

- 状态和时间线交给 Motion：`useMotionValue` / `animate()` / `useSpring` / `useScroll`。
- 每帧在 `useFrame` 里 `.get()` 读值，写进 uniform 或 object transform，不触发 React 重渲染。
- DOM 层（文案、分段控件、标签切换）直接用 `motion.*`、`layoutId`、`AnimatePresence`。

## 封面截图

`.cache/shot.mjs` 用屏幕外的 Edge（CDP）截图，可以绕开内置浏览器面板隐藏时 rAF 暂停的问题：

```bash
cd .cache
FORMAT=webp node --experimental-websocket shot.mjs ../public/posters 1280x800 100 "iso-isle=http://localhost:5196/?poster#/iso-isle|(async()=>{document.body.classList.add('poster');await new Promise(r=>setTimeout(r,2500))})()"
```

URL 带 `?poster` 时等距场景会居中，`body.poster` 会隐藏所有 UI 叠层。

## 接下来可以试的方向

- **等距天气站**：同一座小岛在晴、雨、雪、雷暴之间切换，粒子与光照联动。
- **手势 / 摄像头交互**：用手部关键点控制粒子或等距场景（需要摄像头权限，作为可选交互）。
- **SDF 字体动画**：3D 文字的融化、挤出、碎裂与重组。

## 踩坑记录

- R3F 9 里把 `uniforms={obj}` 作为 JSX 属性传给 `<shaderMaterial>` 会复制标量 uniform，之后写 `obj.uX.value` 不生效。手写着色器统一用 `new THREE.ShaderMaterial()` + `material={mat}`（见 `src/demos/shader/glsl.ts` 的 `useShaderMaterial`）。
- 透明画布（`alpha: true`）上的加法混合会把 alpha 写成 1，出现暗块；需要时改用不透明画布或自定义混合。
- CDP 合成的指针事件 `offsetX/Y` 只有一半，测 R3F 点击要发真实鼠标事件（`Input.dispatchMouseEvent`）。
- 物理 demo 的 Rapier wasm 打进了 ~2.2 MB 的懒加载分块，只在打开该 demo 时加载。
