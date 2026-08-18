import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { name as hostName } from '../src/host.mjs'

const clientPath = fileURLToPath(new URL('../src/client.js', import.meta.url))
const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
const REQUIRED_LOCALE_KEYS = [
  'title', 'description', 'subagentTitle', 'providerDefault', 'apply',
  'searchPlaceholder', 'loading', 'noModels', 'noMatches', 'route',
  'customize', 'collapse', 'editorTitle', 'applyLevel', 'restoreDefault',
  'expandedCount', 'versionLabel', 'customEffortRequired', 'readSettingsFailed',
  'writeFailed',
]

function readPackage() {
  return JSON.parse(readFileSync(packagePath, 'utf8'))
}

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

test('keeps the client version and watermark style tied to package version', () => {
  const pkg = readPackage()
  const source = readFileSync(clientPath, 'utf8')

  assert.ok(source.includes(`const PLUGIN_VERSION = '${pkg.version}'`))
  assert.ok(source.includes("'v' + PLUGIN_VERSION"))
  assert.ok(source.includes("pointerEvents: 'none'"))
})

test('registers balanced Chinese and English dictionaries', () => {
  const source = readFileSync(clientPath, 'utf8')

  assert.ok(source.includes("const LOCALE_NS = 'settings.thinkingEffort'"))
  assert.ok(source.includes('locale.register(LOCALE_NS, { zh, en })'))
  assert.ok(source.includes('locale: LOCALE_NS'))
  for (const key of REQUIRED_LOCALE_KEYS) {
    assert.ok(source.includes(`${key}:`), `missing locale key: ${key}`)
  }
})
