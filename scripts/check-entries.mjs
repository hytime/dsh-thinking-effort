#!/usr/bin/env node
/**
 * Parse every published entry with Node's own syntax checker.
 *
 * The workflows used to run `node --check` on `lib/index.js` and `lib/client.js`
 * only, which covered the two entries that existed before the bundle split. Six
 * subpath entries were added since and none of them was checked, so a broken
 * build of, say, `lib/entries/compaction.js` would reach npm as long as the two
 * legacy paths still parsed.
 *
 * The list comes from the manifest's own `exports`, not from a hand-kept array:
 * an entry added to `exports` is covered the moment it is published, and an
 * entry removed from `exports` stops being checked.
 *
 * @module scripts/check-entries
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

/** Every `default` target the manifest publishes, as absolute paths. */
function publishedEntries() {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
  const targets = []
  for (const [subpath, value] of Object.entries(manifest.exports ?? {})) {
    // `./package.json` is data, not code.
    if (subpath === './package.json') continue
    const target = typeof value === 'string' ? value : value?.default
    if (typeof target !== 'string') continue
    // A pattern export publishes a directory of files, not one module. The
    // locale tables are JSON and the JSON schema checks them; `node --check`
    // on a path containing `*` would look for a literal file and fail.
    if (subpath.includes('*') || target.includes('*')) continue
    // Only JavaScript reaches `--check`; JSON carries no syntax this can verify.
    if (!/\.(?:c|m)?js$/.test(target)) continue
    targets.push({ subpath, file: resolve(ROOT, target) })
  }
  return targets
}

const entries = publishedEntries()
if (entries.length === 0) {
  console.error('check-entries: the manifest publishes no code entries')
  process.exit(1)
}

const failures = []
for (const { subpath, file } of entries) {
  if (!existsSync(file)) {
    failures.push(`${subpath} -> ${file} is missing; run pnpm run build`)
    continue
  }
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    failures.push(`${subpath} -> ${file}\n${output}`)
  }
}

if (failures.length > 0) {
  console.error(`check-entries: ${failures.length} entr${failures.length === 1 ? 'y' : 'ies'} failed to parse`)
  for (const failure of failures) console.error(`\n${failure}`)
  process.exit(1)
}

console.log(`check-entries: ${entries.length} published entr${entries.length === 1 ? 'y' : 'ies'} parse`)
