import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const clientPath = join(root, 'src', 'client.js')
const zhPath = join(root, 'src', 'locales', 'zh.json')
const enPath = join(root, 'src', 'locales', 'en.json')
const marker = /\/\* BEGIN GENERATED LOCALE DATA \*\/[\s\S]*?\/\* END GENERATED LOCALE DATA \*\//

const zh = JSON.parse(readFileSync(zhPath, 'utf8'))
const en = JSON.parse(readFileSync(enPath, 'utf8'))
const zhKeys = Object.keys(zh).sort()
const enKeys = Object.keys(en).sort()
if (JSON.stringify(zhKeys) !== JSON.stringify(enKeys)) {
  const missingInZh = enKeys.filter(key => !zhKeys.includes(key))
  const missingInEn = zhKeys.filter(key => !enKeys.includes(key))
  throw new Error(`locale keys differ; missing in zh: ${missingInZh.join(', ') || 'none'}; missing in en: ${missingInEn.join(', ') || 'none'}`)
}

const source = readFileSync(clientPath, 'utf8')
if (!marker.test(source)) throw new Error('client.js is missing the generated locale data markers')
const generated = [
  '/* BEGIN GENERATED LOCALE DATA */',
  `    const LOCALE_DATA = ${JSON.stringify({ zh, en })};`,
  '    const { zh, en } = LOCALE_DATA;',
  '    /* END GENERATED LOCALE DATA */',
].join('\n')
writeFileSync(clientPath, source.replace(marker, generated))
