/**
 * The repository's memory guard. `docs/CONVENTIONS.md` states where each
 * shared primitive lives; this script makes a violation fail the suite instead
 * of relying on the next author to remember.
 *
 * Exported as a pure function so `tests/conventions.test.ts` can prove the
 * rules still fire on a deliberately wrong sample — a guard that silently
 * stopped matching would be worse than no guard.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Files allowed to state a shared literal; everything else must import it. */
const OWNERS = new Set(['src/shared/guards.ts', 'src/shared/constants.ts', 'src/shared/conflict.ts'])

const RULES = [
  {
    rule: 'guard-duplication',
    // The exact body of `isUnknownRecord`, which no other module may restate.
    // The `(\w+)` capture plus `\1` backreferences bind the three occurrences to
    // ONE identifier without fixing its name: a rule that merely spelled the
    // parameter `value` matched only implementations that happened to use that
    // name, so three real restatements (`compatSource`, `nested`, `entry`) rode
    // through it. Whitespace is loose for the same reason — the rule is about
    // the shape of the expression, not the source's exact spacing.
    pattern: /typeof\s+(\w+)\s*===\s*'object'\s*&&\s*\1\s*!==\s*null\s*&&\s*!Array\.isArray\(\1\)/,
  },
  {
    rule: 'conflict-duplication',
    // `isSettingsConflict`'s former spellings, none of which may reappear
    // outside `src/shared/conflict.ts`. ONE rule entry with TWO alternatives,
    // because they catch different mistranslations: a single entry keeps the
    // "one violation per offending line" contract of `findViolations` — split
    // into two entries, a line matching both was reported twice.
    //
    // 1. A comparison against the transport's conflict CODE. Anchored on a
    //    comparison operator, so a line that only NAMES the code
    //    (`settings/conflict` / `SETTINGS_CONFLICT`, the prose form this rule's
    //    own documentation uses) is not a violation. Both operand orders are
    //    accepted, since `'settings/conflict' === code` is the same test as
    //    `code === 'settings/conflict'`.
    // 2. An APPLIED conflict MESSAGE regex — one of the two halves
    //    (`/conflict/i`, `/changed since it was read/i`) followed by `.test(`.
    //    The `.test(` requirement drops a bare, never-applied `/conflict/i`,
    //    which is what the prose sample in `tests/conventions.test.ts` cites.
    //
    // The boundary is textual, NOT syntactic: this rule — like every rule
    // here — matches raw lines and cannot tell a comment from code. So
    // `// was: return error.code === 'settings/conflict'` and
    // `// legacy: /conflict/i.test(message)` ARE flagged, exactly like the
    // code they quote. That is deliberate: the removed predicate must not
    // reappear in the tree, commented out included. Only the name-only prose
    // form above is exempt; `tests/conventions.test.ts` pins both sides of
    // that line.
    //
    // Known boundaries: like every rule here it runs per LINE, so only a
    // single-line expression matches. A conflict test split across lines, one
    // that hides the literal inside a helper (`includes('settings/conflict')`,
    // a `switch` case label, an enum member), or a message regex built from
    // `new RegExp('conflict')` is NOT caught; neither is a bare `/conflict/i`
    // that is never applied. The rule covers the comparison and
    // applied-regex shapes the three unified call sites actually used.
    pattern: /(?:['"](?:settings\/conflict|SETTINGS_CONFLICT)['"]\s*[!=]==?|[!=]==?\s*['"](?:settings\/conflict|SETTINGS_CONFLICT)['"]|(?:\/conflict\/[a-z]*|\/changed since it was read\/[a-z]*)\.test\s*\()/i,
  },
  {
    rule: 'snapshot-kind',
    // Ordered BEFORE `identifier-literal`: the snapshot kind embeds the plugin
    // namespace, so a bare identifier rule would not match it (the quotes are
    // not adjacent) and the line would slip through.
    pattern: /['"]dsh-thinking-effort\/config-snapshot['"]/,
  },
  {
    rule: 'identifier-literal',
    pattern: /['"](?:llm-pi-ai|dsh-thinking-effort|thinking-effort)['"]/,
  },
  {
    rule: 'log-prefix',
    pattern: /['"]\[@hytime\/dsh-thinking-effort\]['"]/,
  },
  {
    rule: 'level-table',
    pattern: /['"]off['"]\s*,\s*['"]minimal['"]\s*,\s*['"]low['"]\s*,\s*['"]medium['"]\s*,\s*['"]high['"]\s*,\s*['"]xhigh['"]\s*,\s*['"]max['"]/,
  },
]

/**
 * Report every line that restates a shared primitive.
 * @param files - `{ path, source }` entries, `path` relative to the repo root.
 * @returns one violation per offending line, with its rule, path, and 1-based line.
 */
export function findViolations(files) {
  const violations = []
  for (const { path, source } of files) {
    if (OWNERS.has(path)) continue
    // `src/client/index.ts`'s SLOT_ID is a UI slot id, not a settings section id.
    if (path === 'src/client/index.ts') continue
    source.split('\n').forEach((line, index) => {
      for (const { rule, pattern } of RULES) {
        if (pattern.test(line)) violations.push({ rule, path, line: index + 1, text: line.trim() })
      }
    })
  }
  return violations
}

const root = resolve(import.meta.dirname, '..')

function collect(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) return collect(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

// Main-module detection follows `scripts/pr-policy.mjs:310`: comparing
// `process.argv[1]` to `import.meta.filename` misreports on a symlinked path.
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const files = collect(resolve(root, 'src')).map((full) => ({
    path: full.slice(root.length + 1),
    source: readFileSync(full, 'utf8'),
  }))
  const violations = findViolations(files)
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.path}:${violation.line} [${violation.rule}] ${violation.text}`)
    }
    throw new Error(
      `conventions: ${violations.length} duplicated primitive(s). Import from src/shared/ instead; see docs/CONVENTIONS.md`,
    )
  }
  console.log('conventions OK: shared primitives have a single source')
}
