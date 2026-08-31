import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const localeCodes = ['zh', 'en', 'ja', 'ko']
const locales = Object.fromEntries(localeCodes.map((code) => {
  const path = resolve(root, 'src', 'locales', `${code}.json`)
  return [code, JSON.parse(readFileSync(path, 'utf8'))]
}))

const expectedKeys = Object.keys(locales.zh).sort()
for (const code of localeCodes) {
  const keys = Object.keys(locales[code]).sort()
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    const missing = expectedKeys.filter((key) => !keys.includes(key))
    const extra = keys.filter((key) => !expectedKeys.includes(key))
    throw new Error(
      `locale keys differ in ${code}; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`,
    )
  }
}

console.log(`locale parity OK: ${localeCodes.join(', ')}`)
