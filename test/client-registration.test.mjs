import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { name as hostName } from '../src/host.mjs'

const clientPath = fileURLToPath(new URL('../src/client.js', import.meta.url))
const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
const LOCALE_CODES = ['zh', 'en', 'ja', 'ko']
const localePaths = Object.fromEntries(
  LOCALE_CODES.map((code) => [code, fileURLToPath(new URL(`../src/locales/${code}.json`, import.meta.url))]),
)
const REQUIRED_LOCALE_KEYS = [
  'title', 'description', 'subagentTitle', 'providerDefault', 'apply',
  'searchPlaceholder', 'loading', 'noModels', 'noMatches', 'route',
  'customize', 'collapse', 'editorTitle', 'applyLevel', 'restoreDefault',
  'expandedCount', 'versionLabel', 'customEffortRequired', 'readSettingsFailed',
  'writeFailed', 'languageLabel', 'languageChinese', 'languageEnglish',
  'languageJapanese', 'languageKorean',
]

function readPackage() {
  return JSON.parse(readFileSync(packagePath, 'utf8'))
}

function readLocale(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readLocales() {
  return Object.fromEntries(
    LOCALE_CODES.map((code) => [code, readLocale(localePaths[code])]),
  )
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

test('registers balanced Chinese, English, Japanese, and Korean dictionaries', () => {
  const source = readFileSync(clientPath, 'utf8')
  const locales = readLocales()
  const expectedKeys = Object.keys(locales.zh).sort()

  for (const code of LOCALE_CODES) {
    assert.deepEqual(Object.keys(locales[code]).sort(), expectedKeys, `locale key mismatch: ${code}`)
    for (const key of REQUIRED_LOCALE_KEYS) assert.ok(key in locales[code], `${code} missing locale key: ${key}`)
  }
  assert.ok(source.includes("const LOCALE_NS = 'settings.thinkingEffort'"))
  assert.ok(source.includes('locale.register(LOCALE_NS, { zh, en, ja, ko })'))
  assert.ok(source.includes("value: 'ja'"))
  assert.ok(source.includes("value: 'ko'"))
  assert.ok(source.includes('languageJapanese'))
  assert.ok(source.includes('languageKorean'))
  for (const code of LOCALE_CODES) assert.ok(source.includes(`"${code}"`), `generated locale missing: ${code}`)
  assert.ok(source.includes('locale: LOCALE_NS'))
  assert.ok(source.includes('locale.getSnapshot()'))
  assert.ok(source.includes('locale.setLocale('))
  assert.ok(source.includes('const LOCALE_DATA = '))
})
