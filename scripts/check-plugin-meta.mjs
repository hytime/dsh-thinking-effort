#!/usr/bin/env node
/**
 * Verify the plugin-page metadata this package publishes for itself and its
 * component rows.
 *
 * The plugin page resolves display text as `<specifier>/locale/<lang>.json` and
 * reads `meta.title` / `meta.description`. Two things can silently break that:
 *
 *   1. the export key and the file it points at disagree — Node then answers
 *      ERR_PACKAGE_PATH_NOT_EXPORTED, because a resolved target must itself be
 *      exported (this shipped once: the key said `./locale/en.json` while the
 *      file was `bundle-en.json`);
 *   2. a row has no locale file at all, so it falls back to the bundle's
 *      one-line description and every row reads the same.
 *
 * Both are invisible in the build and in every unit test, so this checks them
 * against the filesystem the way the resolver will.
 *
 * @module scripts/check-plugin-meta
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const LANGS = ['en', 'zh', 'ja', 'ko']
/** The subpath entries whose rows the plugin page renders. */
const ENTRIES = ['settings', 'opencode', 'compaction', 'subagent', 'migration', 'composer']

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
const exports = manifest.exports ?? {}
const failures = []

/** Resolve one export target, expanding a single `*` against the filesystem. */
function expandExport(key, target) {
  if (!target.includes('*')) return [target]
  const [prefix, suffix] = target.split('*')
  const dir = resolve(ROOT, prefix.replace(/\/$/, ''))
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith(suffix.replace(/^\//, '')))
    .map((name) => `${prefix}${name}`)
}

/** Assert one `<specifier>/locale/<lang>.json` request answers a real file. */
function checkLocaleExport(key, label) {
  const target = exports[key]
  if (target === undefined) {
    failures.push(`${label}: no export for ${key}`)
    return
  }
  for (const file of expandExport(key, target)) {
    if (!existsSync(resolve(ROOT, file))) failures.push(`${label}: ${key} -> ${file} is missing`)
  }
}

// The bundle row.
for (const lang of LANGS) checkLocaleExport(`./locale/${lang}.json`, 'bundle')

// Each component row: its own title and description, in every language.
for (const entry of ENTRIES) {
  const dir = resolve(ROOT, 'locale', 'entries', entry)
  if (!existsSync(dir)) {
    failures.push(`${entry}: no locale directory`)
    continue
  }
  for (const lang of LANGS) {
    const file = resolve(dir, `${lang}.json`)
    if (!existsSync(file)) {
      failures.push(`${entry}: missing ${lang}.json`)
      continue
    }
    let parsed
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      failures.push(`${entry}/${lang}.json: ${String(error)}`)
      continue
    }
    for (const field of ['title', 'description']) {
      const value = parsed?.meta?.[field]
      if (typeof value !== 'string' || value.trim() === '') {
        failures.push(`${entry}/${lang}.json: meta.${field} is empty`)
      }
    }
  }
  checkLocaleExport(`./${entry}/locale/*.json`, entry)
}

// A row without its own text is indistinguishable from the bundle in the UI.
const descriptions = new Set()
for (const entry of ENTRIES) {
  const file = resolve(ROOT, 'locale', 'entries', entry, 'en.json')
  if (!existsSync(file)) continue
  descriptions.add(JSON.parse(readFileSync(file, 'utf8')).meta?.description)
}
if (descriptions.size !== ENTRIES.length) {
  failures.push(`component descriptions are not distinct: ${descriptions.size}/${ENTRIES.length}`)
}

if (failures.length > 0) {
  console.error(`check-plugin-meta: ${failures.length} problem(s)`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`check-plugin-meta: ${ENTRIES.length + 1} rows × ${LANGS.length} languages OK`)
