import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const clientPath = fileURLToPath(new URL('../src/client.js', import.meta.url))

function loadDescriptor() {
  let descriptor
  const source = readFileSync(clientPath, 'utf8')
  const context = {
    window: {
      __ModuleLoader__: {
        load(value) {
          descriptor = value
        },
      },
    },
  }
  // The bundle registers its descriptor during evaluation; the factory is not
  // needed to verify the loader identity contract.
  Function('context', `with (context) { ${source}\n }`)(context)
  return descriptor
}

test('registers the browser bundle under the scoped package name', () => {
  const descriptor = loadDescriptor()

  assert.equal(descriptor.id, '@hytime/dsh-thinking-effort')
})
