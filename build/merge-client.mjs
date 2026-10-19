/**
 * 一次性构建脚本：把两个插件的浏览器半身合成一个 client.js。
 * 跑法：node build/merge-client.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n')

const bili = read('bili/client.js')
const ofm = read('models/client.js')

// ---- bili 半身：从 const h = ... 到顶层 return { inject: ['slots'] ... } 之前 ----
const bMark = "    const h = React.createElement\n"
const bStart = bili.indexOf(bMark)
if (bStart < 0) throw new Error('bili: 找不到 const h 标记')
const bEndMark = '\n  },\n})'
const bEnd = bili.lastIndexOf(bEndMark)
if (bEnd < 0) throw new Error('bili: 找不到 factory 结尾标记')
const biliBody = bili.slice(bStart, bEnd)

// ---- 模型半身：OFM factory 函数体（去掉最外层 wrapper 与最后的 return module.exports）----
const oStartMark = '  factory: require => {\n'
const oStart = ofm.indexOf(oStartMark)
if (oStart < 0) throw new Error('ofm: 找不到 factory 标记')
const oEndMark = '    return module.exports\n  },\n})'
const oEnd = ofm.lastIndexOf(oEndMark)
if (oEnd < 0) throw new Error('ofm: 找不到 factory 结尾标记')
const ofmBody = ofm.slice(oStart + oStartMark.length, oEnd)

const indent = (text, n) => text.split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n')

const out = `/**
 * dsh-bili-free-scroll —— 浏览器半端（合并版）
 * ============================================================================
 * 一个 client bundle，两页设置：
 *   「刷B站」  —— 原 dsh-bili-scroll 的设置页（扫码登录 / 开关 / 报告 / 模型选择）
 *   「免费模型」 —— 原 dsh-our-free-model 的渠道页，裁到四个渠道
 *
 * 两份 UI 各自是一个独立的闭包（\`biliHalf\` / \`modelHalf\`），
 * 外面的 apply 依次把它们挂到 shell 上；共享同一个 \`slots\` 上下文。
 * 这样合并不需要动两边组件内部的任何标识符。
 * ============================================================================
 */
window.__ModuleLoader__.load({
  id: 'dsh-bili-free-scroll',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports

    /* ══════════════════ 刷B站 半身 ══════════════════ */
    const biliHalf = (() => {
      const React = require('react')
${indent(biliBody, 6)}
    })()

    /* ══════════════════ 免费模型 半身（裁到四渠道） ══════════════════ */
    const modelHalf = (() => {
${indent(ofmBody, 6)}
      return module.exports
    })()

    function apply(ctx) {
      biliHalf.apply(ctx)
      modelHalf.apply(ctx)
    }

    exports.apply = apply
    exports.inject = ['slots']
    exports.name = 'bili-free-scroll'
    return module.exports
  },
})
`

fs.writeFileSync(path.join(root, 'client.js'), out, 'utf8')
console.log('client.js written:', out.length, 'bytes')
