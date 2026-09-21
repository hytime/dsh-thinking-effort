import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FORMAT_DRAFT,
  draftFromSettings,
  FORMAT_KEYS,
  formatFieldErrors,
  formatOps,
} from '../src/client/opencode-format-validation.js'

const draft = (over: Partial<Record<string, string>>) => ({ ...DEFAULT_FORMAT_DRAFT, ...over })

describe('DEFAULT_FORMAT_DRAFT', () => {
  it('matches the schema defaults', () => {
    expect(DEFAULT_FORMAT_DRAFT).toEqual({
      mode: 'ses-derive',
      time: 'firstUse',
      template: '',
      expression: '',
      script: '',
      validate: '',
      onInvalid: 'warn',
    })
  })

  it('lists every field key', () => {
    expect([...FORMAT_KEYS]).toEqual(['mode', 'time', 'template', 'expression', 'script', 'validate', 'onInvalid'])
  })
})

describe('draftFromSettings', () => {
  it('returns defaults when the namespace is absent', () => {
    expect(draftFromSettings(undefined)).toEqual(DEFAULT_FORMAT_DRAFT)
  })

  it('returns defaults when format is absent', () => {
    expect(draftFromSettings({ opencodeSession: { providers: {} } })).toEqual(DEFAULT_FORMAT_DRAFT)
  })

  it('reads every stored field', () => {
    const stored = {
      opencodeSession: {
        format: { mode: 'template', time: 'hash', template: 'x_{hex12}', expression: '', script: '', validate: '^x', onInvalid: 'drop' },
      },
    }
    expect(draftFromSettings(stored)).toEqual({
      mode: 'template', time: 'hash', template: 'x_{hex12}', expression: '', script: '', validate: '^x', onInvalid: 'drop',
    })
  })

  it('falls back per field for unsupported enum values', () => {
    const stored = { opencodeSession: { format: { mode: 'unknown', time: 'never', onInvalid: 'explode' } } }
    expect(draftFromSettings(stored)).toEqual(DEFAULT_FORMAT_DRAFT)
  })

  it('keeps a non-record format section out of the draft', () => {
    expect(draftFromSettings({ opencodeSession: { format: 'ses-derive' } })).toEqual(DEFAULT_FORMAT_DRAFT)
  })
})

describe('formatFieldErrors', () => {
  it('accepts the default draft', () => {
    expect(formatFieldErrors(DEFAULT_FORMAT_DRAFT)).toEqual([])
  })

  it('rejects a validate source that is not a regular expression', () => {
    expect(formatFieldErrors(draft({ validate: '(' }))).toEqual([{ field: 'validate', error: 'validateRegex' }])
  })

  it('accepts a valid validate source', () => {
    expect(formatFieldErrors(draft({ validate: '^ses_[0-9a-f]{12}$' }))).toEqual([])
  })

  it('ignores an empty validate source', () => {
    expect(formatFieldErrors(draft({ validate: '' }))).toEqual([])
  })

  it('requires a template in template mode', () => {
    expect(formatFieldErrors(draft({ mode: 'template', template: '   ' })))
      .toEqual([{ field: 'template', error: 'templateRequired' }])
  })

  it('does not require a template in other modes', () => {
    expect(formatFieldErrors(draft({ mode: 'ses-derive', template: '' }))).toEqual([])
  })

  it('requires an expression in expression mode', () => {
    expect(formatFieldErrors(draft({ mode: 'expression', expression: '' })))
      .toEqual([{ field: 'expression', error: 'expressionRequired' }])
  })

  it('rejects an unparseable expression', () => {
    expect(formatFieldErrors(draft({ mode: 'expression', expression: "'x' + (" })))
      .toEqual([{ field: 'expression', error: 'expressionSyntax' }])
  })

  it('accepts a parseable expression', () => {
    expect(formatFieldErrors(draft({ mode: 'expression', expression: "'ses_' + hex12 + tail62" }))).toEqual([])
  })

  it('requires a script path in script mode', () => {
    expect(formatFieldErrors(draft({ mode: 'script', script: '  ' })))
      .toEqual([{ field: 'script', error: 'scriptRequired' }])
  })

  it('rejects a relative script path', () => {
    expect(formatFieldErrors(draft({ mode: 'script', script: './session.mjs' })))
      .toEqual([{ field: 'script', error: 'scriptNotAbsolute' }])
  })

  it('accepts absolute POSIX and Windows script paths', () => {
    expect(formatFieldErrors(draft({ mode: 'script', script: '/srv/session.mjs' }))).toEqual([])
    expect(formatFieldErrors(draft({ mode: 'script', script: 'C:\\srv\\session.mjs' }))).toEqual([])
  })

  it('reports several problems at once', () => {
    const errors = formatFieldErrors(draft({ mode: 'template', template: '', validate: '(' }))
    expect(errors).toEqual([
      { field: 'validate', error: 'validateRegex' },
      { field: 'template', error: 'templateRequired' },
    ])
  })
})

describe('formatOps', () => {
  it('emits nothing when the draft equals the saved view', () => {
    expect(formatOps(DEFAULT_FORMAT_DRAFT, DEFAULT_FORMAT_DRAFT)).toEqual([])
  })

  it('emits one field-level set op per changed field', () => {
    const ops = formatOps(draft({ mode: 'passthrough', validate: '^x' }), DEFAULT_FORMAT_DRAFT)
    expect(ops).toEqual([
      { op: 'set', path: ['opencodeSession', 'format', 'mode'], value: 'passthrough' },
      { op: 'set', path: ['opencodeSession', 'format', 'validate'], value: '^x' },
    ])
  })

  it('does not emit ops for unchanged fields', () => {
    expect(formatOps(draft({ template: 'x' }), draft({ template: 'x' }))).toEqual([])
  })
})
