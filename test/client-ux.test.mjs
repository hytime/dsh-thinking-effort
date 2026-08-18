import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const clientPath = fileURLToPath(new URL('../src/client.js', import.meta.url))
const clientSource = readFileSync(clientPath, 'utf8')
const testMarker = 'return module.exports;'

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

function createHarness() {
  assert.ok(clientSource.includes(testMarker))
  const instrumented = clientSource.replace(
    testMarker,
    "module.exports.__test = { SectionEditor };\n    " + testMarker,
  )
  let state
  let initialized = false
  let describeCalls = 0
  let mutateCalls = 0
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
  const connection = {
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
  const render = () => plugin.__test.SectionEditor({ __connection: connection })
  return {
    key,
    render,
    getState: () => state,
    counts: () => ({ describeCalls, mutateCalls }),
  }
}

function openModel(harness) {
  let tree = harness.render()
  find(tree, (node) => node.type === 'button' && node.props['aria-label'] === '展开供应商').props.onClick()
  tree = harness.render()
  find(tree, (node) => node.type === 'button' && node.props['aria-label'] === '打开模型设置').props.onClick()
  return harness.render()
}

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
