/**
 * tools/client-smoke.mjs —— 不开浏览器，验证 client bundle 至少能「装上去」。
 * ============================================================================
 * 干三件事：
 *   1. 用假的 `window.__ModuleLoader__` 接住 client.js 的自注册；
 *   2. 用假 React / document / slots 调 factory + apply；
 *   3. 断言两页设置（settings.section）都注册了、id 不重复。
 *
 * 跑法：node tools/client-smoke.mjs   （退出码 0 = 通过）
 * ============================================================================
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const file = path.join(root, 'client.js')
const source = fs.readFileSync(file, 'utf8')

let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load(def) { loaded = def },
  },
}

const listeners = []
const style = () => ({ setAttribute() {}, remove() {}, textContent: '', appendChild() {} })
globalThis.document = {
  head: { appendChild(el) { listeners.push(el) }, removeChild() {} },
  createElement() { return style() },
  createTextNode(t) { return { text: t } },
}
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'smoke' }, configurable: true }) } catch { /* Node 自带 navigator，用不了就算了 */ }
globalThis.fetch = async () => { throw new Error('smoke: 不应该发请求') }

// ---- 极简 React：组件不会被真的渲染，所以 hook 只要能存值就够 ----
let hookSlot = 0
const react = {
  createElement(type, props, ...children) { return { type, props: props ?? {}, children } },
  Fragment: 'Fragment',
  useState(init) { const i = hookSlot++; return [typeof init === 'function' ? init() : init, () => {}] },
  useEffect() { hookSlot++ },
  useMemo(fn) { hookSlot++; return fn() },
  useRef(v) { hookSlot++; return { current: v } },
  useCallback(fn) { hookSlot++; return fn },
  useLayoutEffect() { hookSlot++ },
  useReducer(_r, init) { hookSlot++; return [init, () => {}] },
  useContext() { hookSlot++; return {} },
  createContext(defaultValue) { return { Provider: 'Provider', _default: defaultValue } },
  memo: (c) => c,
  forwardRef: (c) => c,
  cloneElement: (e) => e,
  Children: { map: (c, f) => (Array.isArray(c) ? c.map(f) : []), toArray: (c) => (Array.isArray(c) ? c : []) },
}
const reactDom = { createPortal: (n) => n, render: () => {}, flushSync: (f) => f() }
const stubRequire = (id) => {
  if (id === 'react') return react
  if (id === 'react-dom') return reactDom
  if (id === 'react/jsx-runtime') return { jsx: react.createElement, jsxs: react.createElement, Fragment: 'Fragment' }
  throw new Error('smoke: 未知依赖 ' + id)
}

// ---- 执行 bundle ----
new Function('window', 'document', 'navigator', 'fetch', source)(globalThis.window, globalThis.document, globalThis.navigator, globalThis.fetch)

const fail = (msg) => { console.error('✗ ' + msg); process.exit(1) }
if (!loaded) fail('client.js 没有调用 __ModuleLoader__.load')
if (loaded.id !== 'dsh-bili-free-scroll') fail('module id 不对：' + loaded.id)

const mod = loaded.factory(stubRequire)
if (!mod || typeof mod.apply !== 'function') fail('factory 没返回 apply')

const registered = []
const sections = []
const slots = {
  inject(name, fn) { sections.push(name); fn() },
  register(spec, comp) { registered.push(spec); return () => {} },
}
const effects = []
const ctx = {
  get: (k) => (k === 'slots' ? slots : undefined),
  slots,
  locale: { bind: () => (key, args) => String(args?.default ?? key) },
  theme: { get: () => ({}), onChange: () => () => {} },
  effect(fn, label) { effects.push(label); return () => {} },
  on() { return () => {} },
  logger: () => ({ info() {}, warn() {}, error() {} }),
}

mod.apply(ctx)

const names = registered.map((s) => s.id)
if (!names.includes('bili-scroll')) fail('缺少「刷B站」设置页，只看到：' + names.join(','))
if (!names.includes('our-free-model')) fail('缺少「免费模型」设置页，只看到：' + names.join(','))
if (new Set(names).size !== names.length) fail('设置页 id 重复：' + names.join(','))

console.log('✓ client bundle 装载成功')
console.log('  module :', loaded.id)
console.log('  sections:', names.join(' / '))
console.log('  effects :', effects.length)
