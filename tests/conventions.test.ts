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

  it('flags a re-implemented object guard whatever its parameter is called', () => {
    // The rule must bind the parameter rather than spell it: an earlier version
    // matched only `value`, so restatements using `nested` / `compatSource` /
    // `entry` passed the guard. Three such sites existed in `src/`.
    const sample = [
      'function ownRecord(value: unknown, key: string) {',
      "  const nested = value[key]",
      "  return typeof nested === 'object' && nested !== null && !Array.isArray(nested)",
      '}',
    ].join('\n')
    const found = findViolations([{ path: 'src/client/somewhere.ts', source: sample }])
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

  it('flags a re-implemented conflict predicate outside the shared module', () => {
    // All three shapes Task 4 removed: a local code comparison (apply.ts), a
    // message regex (OpenCodeFormatCard.tsx), and the legacy wording
    // (SectionEditor.tsx). Each is one line, which is the rule's documented
    // boundary.
    const sample = [
      "  return error.code === 'settings/conflict'",
      "  return code !== 'SETTINGS_CONFLICT'",
      'const isConflict = (message: string): boolean => /conflict/i.test(message)',
      'return typeof message === \'string\' && /changed since it was read/i.test(message)',
    ].join('\n')
    const found = findViolations([{ path: 'src/client/somewhere.ts', source: sample }])
    expect(found.map((violation) => violation.rule)).toEqual([
      'conflict-duplication',
      'conflict-duplication',
      'conflict-duplication',
      'conflict-duplication',
    ])
    expect(found.map((violation) => violation.line)).toEqual([1, 2, 3, 4])
  })

  it('allows the shared module to state the conflict predicate', () => {
    const sample = [
      'export function isSettingsConflict(error: unknown): boolean {',
      "  if (code === 'settings/conflict' || code === 'SETTINGS_CONFLICT') return true",
      '  return /changed since it was read/i.test(message) || /conflict/i.test(message)',
      '}',
    ].join('\n')
    expect(findViolations([{ path: 'src/shared/conflict.ts', source: sample }])).toEqual([])
  })

  it('does not fire on prose that merely names the conflict code', () => {
    // Name-only prose: no comparison operator and no `.test(`. This is the
    // whole comment exemption. Treating even this as a violation would push
    // authors to stop naming the code they are talking about.
    const sample = [
      '/** The Remote classifies a stale revision as `settings/conflict`; older transports only carry the message. */',
      ' * `/conflict/i` was the previous local test.',
      '// see SETTINGS_CONFLICT above',
    ].join('\n')
    expect(findViolations([{ path: 'src/client/somewhere.ts', source: sample }])).toEqual([])
  })

  it('still fires on a comment that quotes an executable conflict form', () => {
    // The exemption above stops at name-only prose: the guard matches raw
    // lines and cannot tell a comment from code, so quoting the removed
    // predicate in a comment is flagged exactly like the code itself. An
    // earlier revision of the rule's comments and `docs/CONVENTIONS.md:28`
    // claimed a `.test(` requirement "separates a predicate from a comment
    // that quotes the old pattern" — those comments in fact matched, so the
    // documentation promised an exemption the guard did not grant. This test
    // pins the real boundary.
    const sample = [
      "// was: return error.code === 'settings/conflict'",
      '// legacy: /conflict/i.test(message)',
      " *   if (code === 'SETTINGS_CONFLICT') ...",
      '// the conflict code lives in shared/conflict.ts',
    ].join('\n')
    const found = findViolations([{ path: 'src/client/somewhere.ts', source: sample }])
    expect(found.map((violation) => violation.rule)).toEqual([
      'conflict-duplication',
      'conflict-duplication',
      'conflict-duplication',
    ])
    expect(found.map((violation) => violation.line)).toEqual([1, 2, 3])
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

  it('exempts the plugin slot id declaration, which is not a settings section id', () => {
    expect(findViolations([{ path: 'src/client/index.ts', source: "const SLOT_ID = 'thinking-effort'" }])).toEqual([])
  })

  it('does not exempt the rest of src/client/index.ts along with the slot id', () => {
    // The exemption is one LINE, not a file. An earlier revision skipped all of
    // `src/client/index.ts`, so every other rule was silently off inside it —
    // a duplicate literal, a copied guard and a `settings/conflict` comparison
    // all passed. This test pins the narrowing: the declaration above is still
    // allowed while a genuine violation on any other line is caught.
    const lines = [
      "const SLOT_ID = 'thinking-effort'",
      "const NS = 'llm-pi-ai'",
      "if (code === 'settings/conflict') return true",
      "return typeof value === 'object' && value !== null && !Array.isArray(value)",
    ]
    const found = findViolations([{ path: 'src/client/index.ts', source: lines.join('\n') }])
    expect(found.map((violation) => violation.rule)).toEqual([
      'identifier-literal',
      'conflict-duplication',
      'guard-duplication',
    ])
    expect(found.map((violation) => violation.line)).toEqual([2, 3, 4])
  })

  it('flags a duplicated default-levels object and generator vocabularies', () => {
    // The constants table's second row used to be aspirational: only
    // `ALL_LEVELS`'s seven-value sequence had a rule, so re-writing
    // `DEFAULT_LEVELS` or any `FORMAT_*` vocabulary produced no violation while
    // `docs/CONVENTIONS.md` listed them as a single source.
    const found = findViolations([{
      path: 'src/host/foo.ts',
      source: [
        "const DEFAULT_LEVELS = { off: null, high: 'high', max: 'max' } as const",
        "const FORMAT_MODES = ['ses-derive', 'passthrough', 'template', 'expression', 'script'] as const",
        "const FORMAT_TIMES = ['firstUse', 'hash'] as const",
        "const FORMAT_INVALID_POLICIES = ['warn', 'drop', 'send'] as const",
      ].join('\n'),
    }])
    expect(found.map((violation) => violation.rule)).toEqual([
      'default-levels',
      'format-modes',
      'format-times',
      'format-policies',
    ])
    expect(found.map((violation) => violation.line)).toEqual([1, 2, 3, 4])
  })

  it('allows the shared module to state the constant table', () => {
    const source = [
      "export const ALL_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const",
      "export const DEFAULT_LEVELS = { off: null, high: 'high', max: 'max' } as const",
      "export const FORMAT_MODES = ['ses-derive', 'passthrough', 'template', 'expression', 'script'] as const",
      "export const FORMAT_TIMES = ['firstUse', 'hash'] as const",
      "export const FORMAT_INVALID_POLICIES = ['warn', 'drop', 'send'] as const",
    ].join('\n')
    expect(findViolations([{ path: 'src/shared/constants.ts', source }])).toEqual([])
  })

  it('does not fire on a single generator mode, only on a restated vocabulary', () => {
    // `'ses-derive'` is a legitimate default and `switch` label in the Host and
    // the Client; only re-declaring the comma-separated list is duplication.
    // Flagging the bare names would be a false positive.
    const source = [
      "mode: 'ses-derive',",
      "time: 'firstUse',",
      "if (config.onInvalid === 'drop') {",
      "case 'passthrough':",
    ].join('\n')
    expect(findViolations([{ path: 'src/host/foo.ts', source }])).toEqual([])
  })

  it('states the guard rule\'s real whitespace and coverage boundary', () => {
    // `docs/CONVENTIONS.md` and the rule's own comment used to claim whitespace
    // was loose without qualification. The tail is spelled
    // `!Array\.isArray\(\1\)` with no `\s*` inside it, and the whole rule is the
    // POSITIVE conjunction only. This test pins both boundaries so neither can
    // be re-described as covered.
    const spaced = [
      "return typeof value === 'object' && value !== null && !Array.isArray( value )",
      "return typeof value === 'object' && value !== null && ! Array.isArray(value)",
    ].join('\n')
    expect(findViolations([{ path: 'src/host/foo.ts', source: spaced }])).toEqual([])
    const negated = "if (typeof node !== 'object' || node === null || Array.isArray(node)) return false"
    expect(findViolations([{ path: 'src/host/foo.ts', source: negated }])).toEqual([])
  })

  it('passes on this repository as it stands', () => {
    expect(findViolations(conventionsInputs())).toEqual([])
  })
})
