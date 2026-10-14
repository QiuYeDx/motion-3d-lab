import type { StylizeEffect } from '../../lib/stylize'
import { asciiMeta, asciiModes, createAsciiEffect, setAsciiMode, type AsciiMode } from './effects/ascii'
import { createPixelEffect, pixelMeta, pixelModes, setPixelMode, type PixelMode } from './effects/pixel'
import { createDitherEffect, ditherMeta, ditherModes, setDitherMode, type DitherMode } from './effects/dither'
import { createEngraveEffect, engraveMeta, engraveModes, setEngraveMode, type EngraveMode } from './effects/engrave'
import { createHalftoneEffect, halftoneMeta, halftoneModes, setHalftoneMode, type HalftoneMode } from './effects/halftone'
import { createMosaicEffect, mosaicMeta, mosaicModes, setMosaicMode, type MosaicMode } from './effects/mosaic'
import { createSketchEffect, setSketchMode, sketchMeta, sketchModes, type SketchMode } from './effects/sketch'

import { createToonEffect, toonMeta, toonModes, setToonMode, type ToonMode } from './effects/toon'
import { createThermalEffect, thermalMeta, thermalModes, setThermalMode, type ThermalMode } from './effects/thermal'
import { createOilEffect, oilMeta, oilModes, setOilMode, type OilMode } from './effects/oil'
import { createWatercolorEffect, rebloomWatercolor, watercolorMeta, watercolorModes, setWatercolorMode, type WatercolorMode } from './effects/watercolor'
import { createEmbroideryEffect, stitchInEmbroidery, embroideryMeta, embroideryModes, setEmbroideryMode, type EmbroideryMode } from './effects/embroidery'
import { createCyanotypeEffect, developCyanotype, cyanotypeMeta, cyanotypeModes, setCyanotypeMode, type CyanotypeMode } from './effects/cyanotype'
import { createGlitchEffect, glitchMeta, glitchModes, setGlitchMode, type GlitchMode } from './effects/glitch'
import { createGlassEffect, glassMeta, glassModes, setGlassMode, type GlassMode } from './effects/stainedglass'
import { createPapercutEffect, papercutMeta, papercutModes, setPapercutMode, type PapercutMode } from './effects/papercut'
import { createCrayonEffect, drawCrayon, crayonMeta, crayonModes, setCrayonMode, type CrayonMode } from './effects/crayon'
import { createPointillismEffect, pointillismMeta, pointillismModes, setPointillismMode, type PointillismMode } from './effects/pointillism'
import { createNeonEffect, powerOnNeon, neonMeta, neonModes, setNeonMode, type NeonMode } from './effects/neon'
import { createXrayEffect, xrayMeta, xrayModes, setXrayMode, type XrayMode } from './effects/xray'
import { createNianhuaEffect, printNianhua, nianhuaMeta, nianhuaModes, setNianhuaMode, type NianhuaMode } from './effects/nianhua'
import { createUkiyoeEffect, ukiyoeMeta, ukiyoeModes, setUkiyoeMode, type UkiyoeMode } from './effects/ukiyoe'
import { createRomanEffect, romanMeta, romanModes, setRomanMode, type RomanMode } from './effects/roman'
import { createTopoEffect, topoMeta, topoModes, setTopoMode, type TopoMode } from './effects/topo'
/** Every stylize effect the switcher can show, in display order. */
export type StyleCat = 'print' | 'hand' | 'craft' | 'line' | 'digital' | 'imaging'

/** rail groups, in display order */
export const STYLE_CATS: { id: StyleCat; label: string }[] = [
  { id: 'print', label: '印刷与版画' },
  { id: 'hand', label: '手绘' },
  { id: 'craft', label: '手工' },
  { id: 'line', label: '线条与卡通' },
  { id: 'digital', label: '数字' },
  { id: 'imaging', label: '成像' },
]

export type StyleDef = {
  id: string
  cat: StyleCat
  short?: string
  note?: string
  meta: { title: string; en: string; background: string; theme: 'light' | 'dark' }
  create: () => StylizeEffect
  /** a mode may override the page tone: `dark: true` (blueprint, LED) or `tone` either way (x-ray scanner is light) */
  modes?: readonly { id: string; label: string; dark?: boolean; tone?: 'light' | 'dark' }[]
  setMode?: (fx: StylizeEffect, id: string) => void
  /** called when the switcher wipes this style in (e.g. restart an intro animation) */
  onEnter?: (fx: StylizeEffect) => void
}

// assign instead of spreading so effects that keep state on themselves (fx.sketch, fx.mosaic …) stay intact
const withBg = (create: () => StylizeEffect, background: string) => () => Object.assign(create(), { background })

export const STYLES: StyleDef[] = [
  {
    id: 'halftone',
    cat: 'print',
    short: '半调',
    note: 'AM 网点 · 分色',
    meta: halftoneMeta,
    create: withBg(createHalftoneEffect, halftoneMeta.background),
    modes: halftoneModes,
    setMode: (fx, id) => setHalftoneMode(fx, id as HalftoneMode),
  },
  {
    id: 'cyanotype',
    cat: 'print',
    short: '蓝晒',
    note: '普鲁士蓝 · 刷涂边缘',
    meta: cyanotypeMeta,
    create: withBg(createCyanotypeEffect, cyanotypeMeta.background),
    modes: cyanotypeModes,
    setMode: (fx, id) => setCyanotypeMode(fx, id as CyanotypeMode),
    onEnter: (fx) => developCyanotype(fx),
  },
  {
    id: 'dither',
    cat: 'print',
    short: '抖动',
    note: '两色 · 世界稳定网点',
    meta: ditherMeta,
    create: withBg(() => createDitherEffect({ world: false }), ditherMeta.background),
    modes: ditherModes,
    setMode: (fx, id) => setDitherMode(fx, id as DitherMode),
  },
  {
    id: 'engrave',
    cat: 'print',
    short: '版画',
    note: '线条随形体起伏',
    meta: engraveMeta,
    create: withBg(createEngraveEffect, engraveMeta.background),
    modes: engraveModes,
    setMode: (fx, id) => setEngraveMode(fx, id as EngraveMode),
  },
  {
    id: 'nianhua',
    cat: 'print',
    short: '年画',
    note: '墨线版 · 套色',
    meta: nianhuaMeta,
    create: withBg(createNianhuaEffect, nianhuaMeta.background),
    modes: nianhuaModes,
    setMode: (fx, id) => setNianhuaMode(fx, id as NianhuaMode),
    onEnter: (fx) => printNianhua(fx),
  },
  {
    id: 'ukiyoe',
    cat: 'print',
    short: '浮世绘',
    note: '平涂 · 晕刷',
    meta: ukiyoeMeta,
    create: withBg(createUkiyoeEffect, ukiyoeMeta.background),
    modes: ukiyoeModes,
    setMode: (fx, id) => setUkiyoeMode(fx, id as UkiyoeMode),
  },
  {
    id: 'sketch',
    cat: 'hand',
    short: '素描',
    note: '排线 · 手绘轮廓',
    meta: sketchMeta,
    create: withBg(createSketchEffect, sketchMeta.background),
    modes: sketchModes,
    setMode: (fx, id) => setSketchMode(fx, id as SketchMode),
  },
  {
    id: 'crayon',
    cat: 'hand',
    short: '蜡笔',
    note: '蜡质笔触 · 纸纹留白',
    meta: crayonMeta,
    create: withBg(createCrayonEffect, crayonMeta.background),
    modes: crayonModes,
    setMode: (fx, id) => setCrayonMode(fx, id as CrayonMode),
    onEnter: (fx) => drawCrayon(fx),
  },
  {
    id: 'oil',
    cat: 'hand',
    short: '油画',
    note: 'Kuwahara · 厚涂笔触',
    meta: oilMeta,
    create: withBg(createOilEffect, oilMeta.background),
    modes: oilModes,
    setMode: (fx, id) => setOilMode(fx, id as OilMode),
  },
  {
    id: 'watercolor',
    cat: 'hand',
    short: '水彩',
    note: '边缘积色 · 颗粒沉淀',
    meta: watercolorMeta,
    create: withBg(createWatercolorEffect, watercolorMeta.background),
    modes: watercolorModes,
    setMode: (fx, id) => setWatercolorMode(fx, id as WatercolorMode),
    onEnter: (fx) => rebloomWatercolor(fx),
  },
  {
    id: 'pointillism',
    cat: 'hand',
    short: '点彩',
    note: '并置纯色 · 视觉混合',
    meta: pointillismMeta,
    create: withBg(createPointillismEffect, pointillismMeta.background),
    modes: pointillismModes,
    setMode: (fx, id) => setPointillismMode(fx, id as PointillismMode),
  },
  {
    id: 'embroidery',
    cat: 'craft',
    short: '刺绣',
    note: '缎面针 · 丝线光泽',
    meta: embroideryMeta,
    create: withBg(createEmbroideryEffect, embroideryMeta.background),
    modes: embroideryModes,
    setMode: (fx, id) => setEmbroideryMode(fx, id as EmbroideryMode),
    onEnter: (fx) => stitchInEmbroidery(fx),
  },
  {
    id: 'glass',
    cat: 'craft',
    short: '玻璃',
    note: '铅条 · 背光透射',
    meta: glassMeta,
    create: withBg(createGlassEffect, glassMeta.background),
    modes: glassModes,
    setMode: (fx, id) => setGlassMode(fx, id as GlassMode),
  },
  {
    id: 'papercut',
    cat: 'craft',
    short: '剪纸',
    note: '分层 · 投影',
    meta: papercutMeta,
    create: withBg(createPapercutEffect, papercutMeta.background),
    modes: papercutModes,
    setMode: (fx, id) => setPapercutMode(fx, id as PapercutMode),
  },
  {
    id: 'roman',
    cat: 'craft',
    short: '镶嵌',
    note: '石子沿轮廓排布',
    meta: romanMeta,
    create: withBg(createRomanEffect, romanMeta.background),
    modes: romanModes,
    setMode: (fx, id) => setRomanMode(fx, id as RomanMode),
  },
  {
    id: 'toon',
    cat: 'line',
    short: '卡通',
    note: '赛璐璐分色 · 墨线',
    meta: toonMeta,
    create: withBg(createToonEffect, toonMeta.background),
    modes: toonModes,
    setMode: (fx, id) => setToonMode(fx, id as ToonMode),
  },
  {
    id: 'neon',
    cat: 'line',
    short: '霓虹',
    note: '发光轮廓 · 灯管闪烁',
    meta: neonMeta,
    create: withBg(createNeonEffect, neonMeta.background),
    modes: neonModes,
    setMode: (fx, id) => setNeonMode(fx, id as NeonMode),
    onEnter: (fx) => powerOnNeon(fx),
  },
  {
    id: 'ascii',
    cat: 'digital',
    short: '字符',
    note: '字形图集 · 轮廓感知',
    meta: asciiMeta,
    create: withBg(createAsciiEffect, asciiMeta.background),
    modes: asciiModes,
    setMode: (fx, id) => setAsciiMode(fx, id as AsciiMode),
  },
  {
    id: 'pixel',
    cat: 'digital',
    short: '像素',
    note: '低分辨率 · 调色板量化',
    meta: pixelMeta,
    create: withBg(createPixelEffect, pixelMeta.background),
    modes: pixelModes,
    setMode: (fx, id) => setPixelMode(fx, id as PixelMode),
  },
  {
    id: 'glitch',
    cat: 'digital',
    short: '故障',
    note: 'RGB 错位 · 像素排序',
    meta: glitchMeta,
    create: withBg(createGlitchEffect, glitchMeta.background),
    modes: glitchModes,
    setMode: (fx, id) => setGlitchMode(fx, id as GlitchMode),
  },
  {
    id: 'mosaic',
    cat: 'digital',
    short: '拼贴',
    note: '实体单元重拼',
    meta: mosaicMeta,
    create: withBg(createMosaicEffect, mosaicMeta.background),
    modes: mosaicModes,
    setMode: (fx, id) => setMosaicMode(fx, id as MosaicMode),
  },
  {
    id: 'thermal',
    cat: 'imaging',
    short: '热像',
    note: '温度映射 · 传感器噪声',
    meta: thermalMeta,
    create: withBg(createThermalEffect, thermalMeta.background),
    modes: thermalModes,
    setMode: (fx, id) => setThermalMode(fx, id as ThermalMode),
  },
  {
    id: 'xray',
    cat: 'imaging',
    short: 'X光',
    note: '厚度即密度 · 胶片',
    meta: xrayMeta,
    create: withBg(createXrayEffect, xrayMeta.background),
    modes: xrayModes.map((m) => (m.id === 'scan' ? { ...m, tone: 'light' as const } : m)),
    setMode: (fx, id) => setXrayMode(fx, id as XrayMode),
  },
  {
    id: 'topo',
    cat: 'imaging',
    short: '等高线',
    note: '深度即海拔',
    meta: topoMeta,
    create: withBg(createTopoEffect, topoMeta.background),
    modes: topoModes,
    setMode: (fx, id) => setTopoMode(fx, id as TopoMode),
  },
]
