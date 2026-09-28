import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findViolations } from '../scripts/check-conventions.mjs'

const root = resolve(import.meta.dirname, '..')

/** Every `.ts`/`.tsx` under `src/`, in the guard's own input shape. */
function conventionsInputs(): { path: string; source: string }[] {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
  return walk(resolve(root, 'src')).map((full) => ({
    path: full.slice(root.length + 1),
    source: readFileSync(full, 'utf8'),
  }))
}

describe('convention guard', () => {
  it('flags a re-implemented object guard outside the shared module', () => {
    const sample = [
      'function record(value: unknown) {',
      "  return typeof value === 'object' && value !== null && !Array.isArray(value)",
      '}',
    ].join('\n')
    const found = findViolations([{ path: 'src/host/somewhere.ts', source: sample }])
    expect(found).toHaveLength(1)
    expect(found[0]?.rule).toBe('guard-duplication')
  })

  it('allows the shared module to state the guard', () => {
    const sample = [
      'export function isUnknownRecord(value: unknown): value is Record<string, unknown> {',
      "  return typeof value === 'object' && value !== null && !Array.isArray(value)",
      '}',
    ].join('\n')
    expect(findViolations([{ path: 'src/shared/guards.ts', source: sample }])).toEqual([])
  })

  it('flags each duplicated identifier literal outside the shared module', () => {
    const found = findViolations([{
      path: 'src/host/foo.ts',
      source: "const ns = 'llm-pi-ai'\nconst id = 'thinking-effort'\nconst plugin = 'dsh-thinking-effort'\n",
    }])
    expect(found.map((violation) => violation.rule)).toEqual([
      'identifier-literal',
      'identifier-literal',
      'identifier-literal',
    ])
  })

  it('allows the shared module to state the identifiers', () => {
    const source = "export const LLM_PI_AI_NS = 'llm-pi-ai'\nexport const PLUGIN_ENTRY_ID = 'thinking-effort'\nexport const PLUGIN_NS = 'dsh-thinking-effort'\n"
    expect(findViolations([{ path: 'src/shared/constants.ts', source }])).toEqual([])
  })

  it('flags a duplicated log prefix and level table', () => {
    const found = findViolations([{
      path: 'src/host/foo.ts',
      source: [
        "const LOG_PREFIX = '[@hytime/dsh-thinking-effort]'",
        "const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']",
      ].join('\n'),
    }])
    expect(found.map((violation) => violation.rule).sort()).toEqual(['level-table', 'log-prefix'])
  })

  it('flags the snapshot kind, which the identifier rule cannot match', () => {
    // The kind literal embeds the plugin namespace with a slash, so the two
    // quotes are not adjacent and `identifier-literal` alone misses it.
    const source = [
      "const SNAPSHOT_KIND = 'dsh-thinking-effort/config-snapshot'",
      "kind: z.string().default('dsh-thinking-effort/config-snapshot'),",
    ].join('\n')
    const found = findViolations([{ path: 'src/host/foo.ts', source }])
    expect(found.map((violation) => violation.rule)).toEqual(['snapshot-kind', 'snapshot-kind'])
  })

  it('exempts the plugin slot id, which is not a settings section id', () => {
    expect(findViolations([{ path: 'src/client/index.ts', source: "const SLOT_ID = 'thinking-effort'" }])).toEqual([])
  })

  it('passes on this repository as it stands', () => {
    expect(findViolations(conventionsInputs())).toEqual([])
  })
})
