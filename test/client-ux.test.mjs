import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const clientPath = fileURLToPath(new URL('../src/client.js', import.meta.url))
const clientSource = readFileSync(clientPath, 'utf8')
const testMarker = 'return module.exports;'
const instrumented = clientSource.replace(
  testMarker,
  "const apply = module.exports.apply;\n    module.exports.__test = { SectionEditor, settingsBridge, apply };\n    " + testMarker,
)

function walk(node, visit) {
  if (node === null || node === undefined || node === false) return
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit))
    return
  }
  if (typeof node === 'string' || typeof node === 'number') {
    visit(node)
    return
  }
  if (typeof node === 'object') {
    visit(node)
    if (node.children) node.children.forEach((child) => walk(child, visit))
  }
}

function textOf(tree) {
  const parts = []
  walk(tree, (node) => {
    if (typeof node === 'string' || typeof node === 'number') parts.push(String(node))
  })
  return parts.join('|')
}

function find(tree, predicate) {
  let result = null
  walk(tree, (node) => {
    if (!result && typeof node === 'object' && predicate(node)) result = node
  })
  return result
}

function createHarness(settingsMode = 'legacy', locale = undefined) {
  let state
  let initialized = false
  let describeCalls = 0
  let mutateCalls = 0
  let modernMutateArgs
  const key = 'provider/model-a'
  const raw = {
    id: 'model-a',
    reasoningEfforts: { off: null },
    input: ['text'],
  }
  const inventory = [{
    route: 'provider',
    model: 'model-a',
    name: 'model-a',
    raw,
    levels: { off: null },
    input: ['text'],
    contextWindow: undefined,
    index: 0,
    inOverrides: false,
  }]
  const savedRaw = {
    ...raw,
    reasoningEfforts: { off: null, minimal: 'minimal' },
  }
  const namespace = {
    ns: 'llm-pi-ai',
    revision: 2,
    value: { providers: { provider: { models: [savedRaw] } } },
    user: {},
  }
  const modernSettings = {
    describe: () => Promise.resolve({ ok: true, value: { namespaces: [namespace] } }),
    mutate: (ns, ops, expectedRevision) => {
      modernMutateArgs = { ns, ops, expectedRevision }
      mutateCalls += 1
      return Promise.resolve({ ok: true, value: namespace })
    },
  }
  const connection = settingsMode === 'modern' ? {} : {
    api: {
      settings: {
        describe: () => {
          describeCalls += 1
          return Promise.resolve({ result: { ok: true, value: { namespaces: [namespace] } } })
        },
        mutate: () => {
          mutateCalls += 1
          return Promise.resolve({ result: { ok: true, value: namespace } })
        },
      },
    },
  }
  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...(props || {}), children },
      children,
    }),
    useState: (initial) => {
      if (!initialized) {
        state = { ...initial, loading: false, inventory }
        initialized = true
      }
      return [state, (update) => {
        state = typeof update === 'function' ? update(state) : update
      }]
    },
    useEffect: () => {},
  }
  const captured = {}
  const fakeWindow = {
    document: { body: {} },
    getComputedStyle: () => ({ backgroundColor: 'rgb(28,28,30)' }),
    matchMedia: () => ({ matches: true }),
    __ModuleLoader__: { load: (descriptor) => { captured.descriptor = descriptor } },
  }
  new Function('window', 'document', instrumented)(fakeWindow, fakeWindow.document)
  const plugin = captured.descriptor.factory((name) => name === 'react' ? React : {})
  const render = () => plugin.__test.SectionEditor({
    __connection: connection,
    ...(settingsMode === 'modern' ? { __settings: modernSettings } : {}),
    ...(locale === undefined ? {} : { __locale: locale }),
  })
  return {
    key,
    render,
    getState: () => state,
    modernMutateArgs: () => modernMutateArgs,
    counts: () => ({ describeCalls, mutateCalls }),
  }
}

function createApplyHarness(mode) {
  const injected = []
  const sections = []
  let registered = 0
  let legacyDescribeCalls = 0
  let modernDescribeArgs
  let modernMutateArgs
  const modernSettings = {
    describe: (...args) => {
      modernDescribeArgs = args
      return Promise.resolve({ ok: true, value: { namespaces: [] } })
    },
    mutate: (ns, ops, expectedRevision) => {
      modernMutateArgs = { ns, ops, expectedRevision }
      return Promise.resolve({ ok: true, value: { namespaces: [] } })
    },
  }
  const remoteProxy = new Proxy({}, {
    get: () => {
      throw new Error('cannot get property "remote.settings" without inject')
    },
  })
  const child = {
    get(name) {
      if (name === 'remote.settings') return modernSettings
      if (name === 'remote') return remoteProxy
      return undefined
    },
  }
  const legacyApplySettings = {
    describe: () => {
      throw new Error('legacy apply must not read Settings')
    },
    mutate: () => Promise.resolve({ result: { ok: true, value: { namespaces: [] } } }),
  }
  const legacySettings = {
    describe: () => {
      legacyDescribeCalls += 1
      return Promise.resolve({ result: { ok: true, value: { namespaces: [] } } })
    },
    mutate: () => Promise.resolve({ result: { ok: true, value: { namespaces: [] } } }),
  }
  const connection = mode === 'modern' ? {} : {
    api: { settings: mode === 'legacy-settings' ? legacySettings : legacyApplySettings },
  }
  const locale = {
    register: () => () => {},
    bind: () => (key) => key,
    getSnapshot: () => ({ active: 'zh', locales: [{ id: 'zh' }] }),
  }
  const slots = {
    inject: (_name, callback) => callback(),
    register: (descriptor, render) => {
      registered += 1
      sections.push({ descriptor, render })
    },
  }
  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...(props || {}), children },
      children,
    }),
  }
  let descriptor
  const fakeWindow = {
    __ModuleLoader__: { load: (value) => { descriptor = value } },
  }
  new Function('window', 'document', instrumented)(fakeWindow, {})
  const plugin = descriptor.factory((name) => name === 'react' ? React : {})
  const harness = {
    get(name) {
      if (name === 'slots') return slots
      if (name === 'connection') return connection
      if (name === 'locale') return locale
      if (name === 'remote.settings') {
        throw new Error('cannot get property "remote.settings" without inject')
      }
      return undefined
    },
    effect: (callback) => callback(),
    inject(names, callback) {
      injected.push(names.slice())
      if (mode !== 'modern') return
      if (names.length === 1 && names[0] === 'remote.settings') {
        callback(child)
        return
      }
      throw new Error('unsupported injection: ' + JSON.stringify(names))
    },
    slots,
    locale,
    modernSettings,
    modernDescribeArgs: () => modernDescribeArgs,
    modernMutateArgs: () => modernMutateArgs,
    apply: () => plugin.__test.apply(harness),
    renderedSection: () => sections[0].render({}),
    injected,
    get registered() { return registered },
    get legacyDescribeCalls() { return legacyDescribeCalls },
  }
  return harness
}

function openModel(harness) {
  let tree = harness.render()
  find(tree, (node) => node.type === 'button' && node.props['aria-label'] === '展开供应商').props.onClick()
  tree = harness.render()
  find(tree, (node) => node.type === 'button' && node.props['aria-label'] === '打开模型设置').props.onClick()
  return harness.render()
}

test('keeps the top-level client active on legacy DSH without Remote', () => {
  const harness = createApplyHarness('legacy')
  assert.doesNotThrow(() => harness.apply())
  assert.deepEqual(harness.injected, [['remote.settings']])
  assert.equal(harness.registered, 1)
  assert.equal(harness.legacyDescribeCalls, 0)
})

test('uses legacy Settings API when Remote namespace is absent', async () => {
  const harness = createApplyHarness('legacy-settings')
  harness.apply()
  const section = harness.renderedSection()
  section.props.__settings.describe()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(harness.legacyDescribeCalls, 1)
})

test('wraps remote.settings in a direct-result bridge', async () => {
  const harness = createApplyHarness('modern')
  assert.doesNotThrow(() => harness.apply())
  assert.deepEqual(harness.injected, [['remote.settings']])
  assert.equal(harness.registered, 1)
  const section = harness.renderedSection()
  const bridge = section.props.__settings
  assert.notEqual(bridge, harness.modernSettings)
  assert.equal(typeof bridge.describe, 'function')
  assert.equal(typeof bridge.mutate, 'function')

  const describeResult = await bridge.describe()
  assert.deepEqual(harness.modernDescribeArgs(), [])
  assert.deepEqual(describeResult, { ok: true, value: { namespaces: [] } })
  assert.equal(describeResult.result, undefined)

  const ops = [{ op: 'set', path: ['providers'], value: {} }]
  const mutateResult = await bridge.mutate('llm-pi-ai', ops, 3)
  assert.deepEqual(harness.modernMutateArgs(), {
    ns: 'llm-pi-ai',
    ops,
    expectedRevision: 3,
  })
  assert.deepEqual(mutateResult, { ok: true, value: { namespaces: [] } })
  assert.equal(mutateResult.result, undefined)
})

test('automatically fills a selected effort wire value', () => {
  const harness = createHarness()
  const tree = openModel(harness)
  const minimal = find(tree, (node) => node.type === 'button'
    && node.props.role === 'switch'
    && node.props['aria-label'] === 'minimal 档位')
  assert.ok(minimal)
  assert.equal(minimal.props['aria-checked'], false)
  minimal.props.onClick()
  const updated = harness.render()
  assert.ok(find(updated, (node) => node.type === 'input'
    && node.props.type === 'text'
    && node.props.value === 'minimal'))
})

test('keeps drafts and scroll-safe in-place save state', async () => {
  const harness = createHarness()
  let tree = openModel(harness)
  find(tree, (node) => node.type === 'button'
    && node.props.role === 'switch'
    && node.props['aria-label'] === 'minimal 档位').props.onClick()
  tree = harness.render()
  find(tree, (node) => node.type === 'button'
    && node.props['aria-label'] === '收起模型设置').props.onClick()
  tree = harness.render()
  find(tree, (node) => node.type === 'button'
    && node.props['aria-label'] === '打开模型设置').props.onClick()
  tree = harness.render()
  assert.ok(find(tree, (node) => node.type === 'input'
    && node.props.type === 'text'
    && node.props.value === 'minimal'))
  const save = find(tree, (node) => node.type === 'button' && textOf(node).includes('保存更改'))
  assert.ok(save)
  save.props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(harness.counts(), { describeCalls: 0, mutateCalls: 1 })
  assert.equal(harness.getState().revision, 2)
  assert.equal(harness.getState().dirty[harness.key], undefined)
  assert.ok(textOf(harness.render()).includes('模型设置已保存'))
})

test('uses the current direct Settings Remote contract', async () => {
  const harness = createHarness('modern')
  let tree = openModel(harness)
  find(tree, (node) => node.type === 'button'
    && node.props.role === 'switch'
    && node.props['aria-label'] === 'minimal 档位').props.onClick()
  tree = harness.render()
  const save = find(tree, (node) => node.type === 'button' && textOf(node).includes('保存更改'))
  assert.ok(save)
  save.props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(harness.modernMutateArgs(), {
    ns: 'llm-pi-ai',
    expectedRevision: 0,
    ops: [{
      op: 'set',
      path: ['providers', 'provider', 'models'],
      value: [savedModelForTest()],
    }],
  })
  assert.ok(textOf(harness.render()).includes('模型设置已保存'))
})

function savedModelForTest() {
  return {
    id: 'model-a',
    reasoningEfforts: { off: null, minimal: 'minimal' },
    input: ['text'],
  }
}

test('hides external locale options on legacy DSH', () => {
  const legacyLocale = {
    getSnapshot: () => ({ active: 'zh', locales: [{ id: 'zh' }, { id: 'en' }] }),
    setLocale: () => {},
  }
  const tree = createHarness('legacy', legacyLocale).render()
  const select = find(tree, (node) => node.type === 'select')
  assert.ok(select)
  assert.deepEqual(select.children.filter(Boolean).map((node) => node.props.value), ['zh', 'en'])
})
