import {
  collectExpressionNames,
  EXPRESSION_HELPER_NAMES,
  parseExpression,
  SESSION_CONTEXT_KEYS,
} from '../compat/opencode-expression.js'
import {
  FORMAT_INVALID_POLICIES,
  FORMAT_MODES,
  FORMAT_TIMES,
} from '../compat/opencode-session.js'
import type { SettingsOp } from './types.js'

/** The namespace the generator settings live in. */
export const FORMAT_NAMESPACE = 'dsh-thinking-effort'

/** The path prefix every generated op addresses. */
export const FORMAT_PATH = ['opencodeSession', 'format'] as const

export { FORMAT_INVALID_POLICIES, FORMAT_MODES, FORMAT_TIMES }

/** The seven editable fields, in the order the card renders them. */
export const FORMAT_KEYS = ['mode', 'time', 'template', 'expression', 'script', 'validate', 'onInvalid'] as const

export type FormatField = typeof FORMAT_KEYS[number]

export interface FormatDraft {
  readonly mode: string
  readonly time: string
  readonly template: string
  readonly expression: string
  readonly script: string
  readonly validate: string
  readonly onInvalid: string
}

export type FormatFieldError =
  | 'validateRegex'
  | 'templateRequired'
  | 'expressionRequired'
  | 'expressionSyntax'
  | 'expressionUnknownName'
  | 'scriptRequired'
  | 'scriptNotAbsolute'

export interface FormatProblem {
  readonly field: FormatField
  readonly error: FormatFieldError
}

/**
 * Must equal the schema defaults in `src/host/plugin-settings.ts`. Kept as a
 * literal rather than derived from the schema because the client bundle does
 * not import the host schema.
 */
export const DEFAULT_FORMAT_DRAFT: FormatDraft = {
  mode: 'ses-derive',
  time: 'firstUse',
  template: '',
  expression: '',
  script: '',
  validate: '',
  onInvalid: 'warn',
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function own(value: unknown, key: string): unknown {
  const object = record(value)
  if (object === undefined || !Object.prototype.hasOwnProperty.call(object, key)) return undefined
  return object[key]
}

function enumValue(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * Read a draft from a namespace's raw user layer.
 *
 * Unsupported enum values fall back exactly the way the Host resolves them, so
 * the card never shows a mode the Host would not honour. The string fields are
 * taken verbatim, including values the Host would reject at runtime: showing
 * the stored text is what lets the user see and repair a bad entry.
 */
export function draftFromSettings(stored: unknown): FormatDraft {
  const format = own(own(stored, 'opencodeSession'), 'format')
  return {
    mode: enumValue(own(format, 'mode'), FORMAT_MODES, DEFAULT_FORMAT_DRAFT.mode),
    time: enumValue(own(format, 'time'), FORMAT_TIMES, DEFAULT_FORMAT_DRAFT.time),
    template: stringValue(own(format, 'template'), DEFAULT_FORMAT_DRAFT.template),
    expression: stringValue(own(format, 'expression'), DEFAULT_FORMAT_DRAFT.expression),
    script: stringValue(own(format, 'script'), DEFAULT_FORMAT_DRAFT.script),
    validate: stringValue(own(format, 'validate'), DEFAULT_FORMAT_DRAFT.validate),
    onInvalid: enumValue(own(format, 'onInvalid'), FORMAT_INVALID_POLICIES, DEFAULT_FORMAT_DRAFT.onInvalid),
  }
}

/** Whether `value` is an absolute path on POSIX or Windows. */
function isAbsolutePath(value: string): boolean {
  if (value.startsWith('/')) return true
  return /^[A-Za-z]:[\\/]/.test(value)
}

/**
 * Every reason this draft would not do what it appears to say.
 *
 * The rules mirror `resolveFormatConfig` in the Host: a source it cannot parse
 * silently becomes "no validation at all", and an empty `template` /
 * `expression` / `script` silently falls back to `ses-derive`. Both cases look
 * configured to the user while behaving differently, which is exactly what the
 * card has to refuse.
 *
 * An `expression` is therefore checked past its syntax: the evaluator throws on
 * a name it does not know, the Host catches that together with every other
 * evaluation failure, and the same silent fallback follows. A misspelled
 * identifier or helper would read as configured while behaving as if the card
 * had never been filled in.
 */
export function formatFieldErrors(draft: FormatDraft): readonly FormatProblem[] {
  const problems: FormatProblem[] = []

  // Whitespace alone is treated as "not filled in", the same as the three
  // free-text fields below. The Host compiles any non-empty source, and `/   /`
  // is a valid expression that no generated value can match, so a stray space
  // would otherwise reach the Host as a filter that drops every value.
  if (draft.validate.trim() !== '') {
    try {
      new RegExp(draft.validate)
    } catch {
      problems.push({ field: 'validate', error: 'validateRegex' })
    }
  }

  if (draft.mode === 'template' && draft.template.trim() === '') {
    problems.push({ field: 'template', error: 'templateRequired' })
  }

  if (draft.mode === 'expression') {
    if (draft.expression.trim() === '') {
      problems.push({ field: 'expression', error: 'expressionRequired' })
    } else {
      try {
        const names = collectExpressionNames(parseExpression(draft.expression))
        const unknownRef = names.refs.find((name) => !(SESSION_CONTEXT_KEYS as readonly string[]).includes(name))
        const unknownCall = names.calls.find((name) => !(EXPRESSION_HELPER_NAMES as readonly string[]).includes(name))
        if (unknownRef !== undefined || unknownCall !== undefined) {
          problems.push({ field: 'expression', error: 'expressionUnknownName' })
        }
      } catch {
        problems.push({ field: 'expression', error: 'expressionSyntax' })
      }
    }
  }

  if (draft.mode === 'script') {
    if (draft.script.trim() === '') {
      problems.push({ field: 'script', error: 'scriptRequired' })
    } else if (!isAbsolutePath(draft.script.trim())) {
      problems.push({ field: 'script', error: 'scriptNotAbsolute' })
    }
  }

  return problems
}

/**
 * One `set` op per changed field, so saving the generator never rewrites the
 * other keys this namespace holds — the profile library, the rollback copy,
 * and the per-model session switches the model editor owns.
 *
 * A whitespace-only `validate` is written as the empty string. The Host treats
 * any non-empty source as a filter, and whitespace compiles to a regex nothing
 * matches, so an accidental space would otherwise be stored as "drop every
 * value" — the opposite of what the field looks like it says.
 */
export function formatOps(draft: FormatDraft, saved: FormatDraft): readonly SettingsOp[] {
  const ops: SettingsOp[] = []
  for (const key of FORMAT_KEYS) {
    const value = key === 'validate' && draft.validate.trim() === '' ? '' : draft[key]
    if (value === saved[key]) continue
    ops.push({ op: 'set', path: [...FORMAT_PATH, key], value })
  }
  return ops
}
