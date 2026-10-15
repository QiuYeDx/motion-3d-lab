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

## Demo 一览（111 个，五组）

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
| 等距 | 电商链路 `iso-shop` | 一个订单从下单、机器人拣货、打包、卡车穿城到签收，镜头跟随包裹，进度条同步 |
| 等距 | 寻路迷宫 `iso-maze` | A* / Dijkstra / BFS / 贪心逐格搜索并对比，可画墙、拖动起终点，小人走出迷宫 |
| 等距 | 等距游乐园 `iso-park` | 摩天轮、能量守恒的过山车、旋转木马与飞椅，几十个游客排队乘坐，昼夜切换 |
| 等距 | 四季小岛 `iso-seasons` | 春夏秋冬平滑过渡，樱花落叶积雪，晴雨雪雷暴天气，拖动旋转小岛 |
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
| 粒子 | 星系碰撞 `particle-galaxy` | 限制性三体（Toomre）GPU 模拟，潮汐尾与并合成椭圆星系 |
| 粒子 | 神经网络 `particle-neural` | 分层神经元与信号脉冲逐层推理，可手写数字让它识别 |
| 粒子 | 烟花秀 `particle-fireworks` | 点击发射七种花型，闪光照亮烟雾与城市，河面倒影，自动演出与压轴 |
| 粒子 | 体积烟雾 `particle-smoke` | 3.7 万软粒子 + 不透明度阴影图的体积光照，鼠标搅动；烟灰、霓虹、水墨 |
| 材质 | 玻璃折射 `shader-glass` | MeshTransmissionMaterial 折射身后的标题，清透 / 磨砂 / 色散预设 |
| 材质 | AI 光球 `shader-orb` | 噪声位移 + 薄膜虹彩，待机 / 聆听 / 思考 / 回答四态弹簧切换 |
| 材质 | 渐变网格 `shader-gradient` | 全屏域扭曲渐变 + 颗粒，四套配色平滑过渡，叠加 Hero 样例 |
| 材质 | 流光丝带 `shader-ribbon` | GPU 构建的丝带曲面，各向异性高光与背面着色，三套配色 |
| 材质 | 流体墨水 `shader-fluid` | 稳定流体模拟，霓虹 / 水墨（宣纸、飞白）/ 极光三种画风 |
| 材质 | 全息卡片 `shader-holo` | 镭射箔 + 闪粉着色器的会员卡，随指针倾斜变色，点击翻面 |
| 材质 | 熔岩融球 `shader-metaballs` | 光线步进熔岩灯，平滑并集的蜡团分裂融合，指针拉出液滴 |
| 材质 | 雨窗 `shader-rain` | 雨滴折射倒置的清晰城市，玻璃其余部分虚焦；拖动擦出清晰区域 |
| 材质 | 黄昏海面 `shader-ocean` | 8 组 Gerstner 波 + 菲涅尔天空反射与日光带，小船随浪起伏 |
| 材质 | 黑洞 `shader-blackhole` | 弯曲光线的吸积盘、光子环、多普勒增亮与被透镜的星空 |
| 材质 | 体积云海 `shader-clouds` | 光线步进体积云、银边与光束，镜头贴着云顶穿行，时间重投影去噪 |
| 材质 | 极光雪山 `shader-aurora` | 体积极光帘幕、旋转星空与银河、冰湖倒影，点击天空触发亚暴 |
| 材质 | 篝火 `shader-fire` | 程序化火焰、火星粒子、热浪扭曲，添柴会腾起，人物被火光照亮 |
| 风格化 | 风格切换 `stylize-switch` | 同一个静物在下面 44 种画风间斜向擦除切换，右侧按印刷 / 手绘 / 手工 / 线条 / 数字 / 成像分组，拖动分割线对比原图 |
| 风格化 | 半调印刷 `shader-halftone` | 3D 场景实时转 CMYK 网点 / Riso 双色 / 单色报纸，可调网点与套印错位 |
| 风格化 | 字符画 `stylize-ascii` | 字形图集：明暗字符阶、沿轮廓的 / \ \| -、汉字、盲文、代码雨，鼠标处透视原图 |
| 风格化 | 像素风 `stylize-pixel` | 低分辨率渲染 + OKLab 调色板量化 + 1px 描边，像素对齐相机不闪烁；CRT 模式 |
| 风格化 | 1-bit 抖动 `stylize-dither` | Bayer / 蓝噪声 / Atkinson 误差扩散，世界稳定网点对比屏幕空间“游泳” |
| 风格化 | 版画雕刻 `stylize-engrave` | 线条随形体起伏的铜版雕刻、木刻、麻胶双色套印 |
| 风格化 | 素描排线 `stylize-sketch` | 按明暗叠加的排线 + 抖动轮廓线，8 fps “沸腾”；钢笔、炭笔、蓝图 |
| 风格化 | 材料拼贴 `stylize-mosaic` | 乐高、十字绣、马赛克瓷砖、LED 屏，每一格单独打光 |
| 风格化 | 油画笔触 `stylize-oil` | 各向异性 Kuwahara + 顺形体的笔触 + 厚涂光影与亚麻画布；古典、印象派、厚涂 |
| 风格化 | 水彩晕染 `stylize-watercolor` | 边缘积色、颗粒沉淀、湿画渗化与留白，画面会慢慢“晾干” |
| 风格化 | 刺绣针脚 `stylize-embroidery` | 缎面针沿形体排线、丝线捻度与光泽、茎针勾边；缎面绣、苏绣、牛仔补丁 |
| 风格化 | 卡通描边 `stylize-toon` | 赛璐璐分色 + 粗细变化墨线；日式动画、美漫网点、扁平插画 |
| 风格化 | 热成像 `stylize-thermal` | 铁红 / 彩虹 / 白热 / 夜视仪，传感器噪声与定时校准，测温十字线 |
| 风格化 | 彩色玻璃 `stylize-glass` | Voronoi 玻璃块吸附轮廓 + 铅条与焊点 + 背光、气泡与彩绘；教堂、蒂凡尼、现代 |
| 风格化 | 剪纸叠层 `stylize-papercut` | 按远近切成几层手剪彩纸，层层投影与视差；灯箱、中国剪纸、纸雕 |
| 风格化 | 蜡笔粉彩 `stylize-crayon` | 来回涂的蜡笔笔触只挂在纸纹凸处，出线的描边；软粉彩、油粉彩刮画，可“画一遍” |
| 风格化 | 点彩派 `stylize-pointillism` | 修拉式并置纯色点，两色视觉混合 + 互补色点；远看 / 近看与放大镜 |
| 风格化 | 故障艺术 `stylize-glitch` | RGB 错位、块位移、宏块坏块、像素排序；VHS、数据损坏、赛博，点击触发 |
| 风格化 | 蓝晒 `stylize-cyanotype` | 普鲁士蓝曲线、刷涂边缘与水洗痕；经典、植物标本（物影照片）、调色，显影动画 |
| 风格化 | 木版年画 `stylize-nianhua` | 墨线版先印、色版逐版套印且略有错位，木纹与宣纸；杨柳青、桃花坞、朱仙镇，可重演印刷 |
| 风格化 | 浮世绘 `stylize-ukiyoe` | 细线、三阶平涂与天空晕刷（ぼかし）、和纸；北斋、广重、美人画 |
| 风格化 | 罗马镶嵌 `stylize-roman` | 石子沿轮廓成行排布（andamento），外围直排；庞贝、拜占庭金箔、黑白 |
| 风格化 | 霓虹线稿 `stylize-neon` | 只留发光轮廓：灯管接头、逐段通电与闪烁；霓虹灯、激光、蓝图光 |
| 风格化 | 等高线地图 `stylize-topo` | 深度即海拔：首曲线、计曲线与沿线标注、晕渲与分层设色；地形图、线稿、夜光 |
| 风格化 | X 光 `stylize-xray` | 厚度即密度、边缘发亮的胶片；CT 伪彩切片扫描、安检机分色与传送带 |
| 风格化 | 水墨 `stylize-inkwash` | 墨分五色、飞白笔锋、宣纸洇染与留白，远山淡而湿；写意、工笔、泼墨，可重演落墨 |
| 风格化 | 粉笔板书 `stylize-chalk` | 侧锋铺色、断续轮廓、粉笔灰与擦痕；板书讲解带手写公式和箭头，可擦黑板重写 |
| 风格化 | 丝印四联 `stylize-warhol` | Warhol 式 2×2 / 3×3 / 条带，每格撞色与黑版错位，点击单格重新刮印 |
| 风格化 | 刺青线稿 `stylize-tattoo` | 粗描边、点刺阴影、传统配色平涂；黑灰写实、点刺几何，可“上皮肤” |
| 风格化 | 全息投影 `stylize-hologram` | 菲涅尔辉光、色散、扫描线与信号不稳，投影器光锥；星战、赛博、医疗切片 |
| 风格化 | 红外摄影 `stylize-infrared` | 叶绿素在红外下发亮：彩红外粉色植被、黑白红外雪白树、金色红外，带光晕与颗粒 |
| 风格化 | 皮影 `stylize-puppet` | 油灯背光下的半透明驴皮人偶：彩染透光、镂刻花纹、杆影；灯影、剪影、走马灯，孙悟空会表演 |
| 风格化 | 景泰蓝 `stylize-cloisonne` | 金色掐丝勾出小区、缠枝纹细分大面积，宝石彩釉与抛光高光；景泰蓝、画珐琅、银胎 |
| 风格化 | 毛线编织 `stylize-knit` | V 形针目、毛线捻度与绒毛、提花配色，可从织图一行行织起来；粗棒针、钩针 |
| 风格化 | 说明书线图 `stylize-manual` | 积木说明书：等宽黑线、两阶平涂、步骤编号与零件框，小车一步步拼装；家具、爆炸图 |
| 风格化 | 老报纸 `stylize-newspaper` | 整版泛黄报纸：粗网点照片、透印与折痕，版面随号外 / 彩色周末版 / 传真照片切换 |
| 风格化 | 拍立得 `stylize-polaroid` | 一次成像的偏色、暗角与漏光，按快门后照片在桌上慢慢显影；SX-70、600、过期相纸 |
| 风格化 | 青花瓷 `stylize-qinghua` | 钴蓝分水、勾线、铁锈斑与晕散，透亮釉面高光，纹饰贴着器物转；元青花、明清、釉里红 |
| 风格化 | 扎染 `stylize-tiedye` | 蓝靛布上的防染白花：蜘蛛绞、板缔、圈染、螺旋，羽化边缘与折痕；彩虹扎染、绞缬，可“染一次” |
| 风格化 | 剪影动画 `stylize-reiniger` | 赖尼格式默片：带花边镂空的黑纸人物、着色天幕与多层景深、胶片闪烁；琥珀、夜蓝、玫瑰 |
| 风格化 | 数字填色 `stylize-paintbynumber` | 编号色块与细线、区域内的数字，颜料按编号一块块涂满；完成、线稿 |
| 风格化 | 蒸汽波 `stylize-vaporwave` | 粉紫渐变映射、条纹落日与网格地平线、VHS 色偏；千禧、蒸汽石膏 |
| 风格化 | 街机矢量屏 `stylize-vector` | 只有电子束线框，顶点更亮、真实的荧光余辉；绿色、白色、彩色矢量，攻击演示模式 |
| 风格化 | 沙画 `stylize-sand` | 灯箱上的细沙：颗粒明暗、指痕沙沟，手掌抹开再撒出下一幕；暖光、冷光、彩沙 |
| 风格化 | 马克笔速写 `stylize-marker` | 平行宽笔触叠色、针管笔出线、白色高光笔；产品设计、建筑速写、漫画上色 |
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
| 实验 | 封面流轮播 `lab-coverflow` | 3D 卡片环 / 弧 / 列，拖拽惯性吸附，点中间卡片翻面，地面倒影 |
| 实验 | 3D 翻书 `lab-book` | 纸张随拖拽卷曲翻页、投影与书页厚度，可快速拨页与目录跳转 |
| 实验 | 魔方 `lab-cube` | 拖拽贴纸转层、弹簧吸附 90°，打乱、撤销与倒放还原，展开图同步 |
| 实验 | 绳索菜单 `lab-ropes` | Verlet 绳挂的导航卡片：拖拽摆荡、相互碰撞，点击解下打开内容面板 |

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

### 风格化渲染管线（`src/lib/stylize.tsx`）

- `<Stylize effect={fx} />` 接管渲染：场景先画进离屏目标（颜色 + 深度，按需再画一遍视空间法线），再由全屏“效果”着色器重画到屏幕。
- 效果是纯数据：`src/demos/stylize/effects/*.ts` 各自导出 `createXEffect()`，GLSL 只需定义 `vec3 stylize(vec2 px)`，可用 `sceneAt / normalAt / depthAt / coverageAt` 等公共函数；网格与线宽一律按 CSS px × DPR 计算。
- 同一套接口支持 `prev` + `wipe`：两种效果沿同一条斜线擦除切换，也用来做“原图 / 风格”分割对比（`createOriginalEffect()`）。
- `src/demos/stylize/styles.ts` 是切换器的风格清单，新增一种画风只要写一个效果文件并在这里登记。
- 着色器一律异步编译（`renderer.compileAsync` + KHR_parallel_shader_compile）：编译期间先显示普通渲染，就绪后斜向擦除进入风格画面；效果的 `update()` 也从这时才开始计时。`preload` 让切换器在空闲时逐个预编译所有画风。
- 坑：异步编译必须在**屏幕目标**下发起（`setRenderTarget(null)`），否则 three.js 编出的是离屏（线性输出）变体，真正画到屏幕时又同步链接一次，Windows 上 ANGLE/D3D 会卡住主线程数秒。
- 写大着色器时：先选模式再只调用一次昂贵的例程；循环里用 `textureLod/texelFetch`、导数提到循环外；调色板放进 DataTexture 而不是动态索引的 uniform 数组——这些都直接决定 D3D 的编译时间。

### Motion 与 three.js 的配合方式

- 状态和时间线交给 Motion：`useMotionValue` / `animate()` / `useSpring` / `useScroll`。
- 每帧在 `useFrame` 里 `.get()` 读值，写进 uniform 或 object transform，不触发 React 重渲染。
- DOM 层（文案、分段控件、标签切换）直接用 `motion.*`、`layoutId`、`AnimatePresence`。

## 封面截图

`.cache/shot.mjs` 用无头 Chrome（CDP，显卡加速，含 WebGPU）截图，不会弹出任何窗口，也能绕开内置浏览器面板隐藏时 rAF 暂停的问题：

```bash
cd .cache
FORMAT=webp node --experimental-websocket shot.mjs ../public/posters 1280x800 100 "iso-isle=http://localhost:5196/?poster#/iso-isle|(async()=>{document.body.classList.add('poster');await new Promise(r=>setTimeout(r,2500))})()"
```

URL 带 `?poster` 时等距场景会居中，`body.poster` 会隐藏所有 UI 叠层。

## 接下来可以试的方向

- 风格化渲染暂停扩展，后续优先充实其他模块。
- **等距天气站**：同一座小岛在晴、雨、雪、雷暴之间切换，粒子与光照联动。
- **手势 / 摄像头交互**：用手部关键点控制粒子或等距场景（需要摄像头权限，作为可选交互）。
- **SDF 字体动画**：3D 文字的融化、挤出、碎裂与重组。

## 踩坑记录

- R3F 9 里把 `uniforms={obj}` 作为 JSX 属性传给 `<shaderMaterial>` 会复制标量 uniform，之后写 `obj.uX.value` 不生效。手写着色器统一用 `new THREE.ShaderMaterial()` + `material={mat}`（见 `src/demos/shader/glsl.ts` 的 `useShaderMaterial`）。
- 透明画布（`alpha: true`）上的加法混合会把 alpha 写成 1，出现暗块；需要时改用不透明画布或自定义混合。
- CDP 合成的指针事件 `offsetX/Y` 只有一半，测 R3F 点击要发真实鼠标事件（`Input.dispatchMouseEvent`）。
- 截图脚本用无头 Chrome，不要用 Edge 或任何可见窗口（会弹出打扰使用者的全局浮窗）。
- 用 `usePrecompiled` 预编译场景材质时，阴影要写 `<Canvas shadows="percentage">`：默认的 PCFSoft 会在第一次渲染阴影时被 three r186 换成 PCF，预编译的程序全部作废并同步重编。
- 物理 demo 的 Rapier wasm 打进了 ~2.2 MB 的懒加载分块，只在打开该 demo 时加载。
