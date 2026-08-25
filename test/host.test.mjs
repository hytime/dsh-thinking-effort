import test from 'node:test'
import assert from 'node:assert/strict'

import { apply } from '../src/host.mjs'

function createHarness() {
  let descriptors = []
  const listeners = []
  const ctx = {
    settings: {
      writable: false,
      get: () => undefined,
      describe: () => descriptors,
    },
    timeout: () => {},
    on: (name, callback, options) => {
      listeners.push({ name, callback, options })
      return () => {}
    },
  }
  apply(ctx)
  return {
    setDescriptors(next) {
      descriptors = next
    },
    listener(name) {
      return listeners.find((entry) => entry.name === name)
    },
  }
}

test('registers the agent request hook as a global listener', () => {
  const harness = createHarness()
  assert.deepEqual(harness.listener('agent/request')?.options, { global: true })
})

test('reads subagent effort after the settings namespace registers', async () => {
  const harness = createHarness()
  harness.setDescriptors([{ ns: 'llm-pi-ai', user: { subagentEffort: 'max' } }])

  const result = await harness.listener('agent/request').callback(
    { agent: { session: { header: { origin: 'subagent' } } } },
    async () => ({ provider: 'provider', model: 'model' }),
  )

  assert.equal(result.reasoningEffort, 'max')
})
