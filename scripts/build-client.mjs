import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const clientPath = join(root, 'src', 'client.js')
const localeCodes = ['zh', 'en', 'ja', 'ko']
const marker = /\/\* BEGIN GENERATED LOCALE DATA \*\/[\s\S]*?\/\* END GENERATED LOCALE DATA \*\//

const locales = Object.fromEntries(localeCodes.map((code) => [
  code,
  JSON.parse(readFileSync(join(root, 'src', 'locales', `${code}.json`), 'utf8')),
]))
const expectedKeys = Object.keys(locales.zh).sort()
for (const code of localeCodes) {
  const keys = Object.keys(locales[code]).sort()
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    const missing = expectedKeys.filter(key => !keys.includes(key))
    const extra = keys.filter(key => !expectedKeys.includes(key))
    throw new Error(`locale keys differ in ${code}; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`)
  }
}

const source = readFileSync(clientPath, 'utf8')
if (!marker.test(source)) throw new Error('client.js is missing the generated locale data markers')
const generated = [
  '/* BEGIN GENERATED LOCALE DATA */',
  `    const LOCALE_DATA = ${JSON.stringify(locales)};`,
  '    const { zh, en, ja, ko } = LOCALE_DATA;',
  '    /* END GENERATED LOCALE DATA */',
].join('\n')
writeFileSync(clientPath, source.replace(marker, generated))
