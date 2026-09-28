import { describe, expect, it } from 'vitest'
import { ALPHA1_PLUS_COMPAT_FIELDS, ALPHA3_PLUS_COMPAT_FIELDS, GATEWAY_COMPAT_FIELDS, GATEWAY_COMPAT_FIELD_KEYS, GATEWAY_COMPAT_GROUPS, RC8_COMPAT_FIELDS, SUPPORTED_THINKING_FORMATS, fieldsForApi } from '../src/compat/gateway/fields.js'
import { resolveGatewayCompat, resolveModelGatewayCompat } from '../src/compat/gateway/resolve.js'
import { opsForProviderCompat } from '../src/compat/gateway/ops.js'
import type { GatewayCompatEditability } from '../src/compat/gateway/types.js'
import { LOCALE_DATA } from '../src/client/locales.js'

describe('gateway compat field registry', () => {
  it('keeps every field key unique and non-empty', () => {
    expect(new Set(GATEWAY_COMPAT_FIELD_KEYS).size).toBe(GATEWAY_COMPAT_FIELD_KEYS.length)
    for (const key of GATEWAY_COMPAT_FIELD_KEYS) expect(key.length).toBeGreaterThan(0)
  })

  it('requires a label key, non-empty enum values, and a known group for every field', () => {
    for (const spec of Object.values(GATEWAY_COMPAT_FIELDS)) {
      expect(spec.labelKey.length).toBeGreaterThan(0)
      expect(GATEWAY_COMPAT_GROUPS.map((g) => g.id)).toContain(spec.group)
      if (spec.kind === 'enum') expect(spec.enumValues.length).toBeGreaterThan(0)
    }
  })

  it('provides non-empty labels for every field and enum option in all locales', () => {
    for (const spec of Object.values(GATEWAY_COMPAT_FIELDS)) {
      for (const [locale, dictionary] of Object.entries(LOCALE_DATA)) {
        expect(dictionary[spec.labelKey], `${locale}.${spec.labelKey}`).toBeTruthy()
      }
      if (spec.kind === 'enum') {
        for (const option of spec.enumOptions ?? []) {
          expect(option.labelKey, `enum option ${option.value} must define a label key`).toBeTruthy()
          for (const [locale, dictionary] of Object.entries(LOCALE_DATA)) {
            expect(dictionary[option.labelKey!], `${locale}.${option.labelKey}`).toBeTruthy()
          }
        }
      }
    }
  })

  it('keeps thinking formats aligned with the official openai-completions offer', () => {
    expect(SUPPORTED_THINKING_FORMATS).toEqual([
      'openai', 'openrouter', 'deepseek', 'together', 'baseten', 'zai', 'qwen',
      'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling',
    ])
  })

  it('keeps the per-version field sets correct: rc8 omits alpha.1-only fields', () => {
    // 这是硬性兼容边界：rc8 没有 supportsFinishReason / supportsThinkingTokenBudget，
    // 配置它们会被 DSH assertOfferedCompatFields 拒绝。
    expect(RC8_COMPAT_FIELDS).not.toContain('supportsFinishReason')
    expect(RC8_COMPAT_FIELDS).not.toContain('supportsThinkingTokenBudget')
    expect(RC8_COMPAT_FIELDS).toContain('supportsStore')
    expect(ALPHA1_PLUS_COMPAT_FIELDS).toContain('supportsFinishReason')
    expect(ALPHA1_PLUS_COMPAT_FIELDS).toContain('supportsThinkingTokenBudget')
  })

  it('only widens the field sets from one version window to the next', () => {
    // 这是硬性不变量：DSH 只增不减地扩充 compatProfile，所以每个窗口的字段集必须是
    // 上一个窗口的超集且严格更大。把某个窗口写窄会让它区间内的版本丢掉本可配置的字段，
    // 而"只多不少"这一条比逐个窗口的固定增量更难绕过（新增窗口自动纳入检查）。
    const windows = [RC8_COMPAT_FIELDS, ALPHA1_PLUS_COMPAT_FIELDS, ALPHA3_PLUS_COMPAT_FIELDS] as const
    for (let index = 1; index < windows.length; index += 1) {
      const previous = windows[index - 1]!
      const current = windows[index]!
      for (const field of previous) expect(current).toContain(field)
      expect(current.length).toBeGreaterThan(previous.length)
    }
  })

  it('exposes the fields DSH added after 0.1.2 and keeps the version sets widening', () => {
    expect(GATEWAY_COMPAT_FIELD_KEYS).toContain('thinkingTokenBudgetField')
    expect(GATEWAY_COMPAT_FIELD_KEYS).toContain('supportsMaxOutputTokens')
    expect(ALPHA3_PLUS_COMPAT_FIELDS).toContain('thinkingTokenBudgetField')
    expect(ALPHA3_PLUS_COMPAT_FIELDS).toContain('supportsMaxOutputTokens')
    expect(ALPHA1_PLUS_COMPAT_FIELDS).not.toContain('thinkingTokenBudgetField')
    expect(ALPHA1_PLUS_COMPAT_FIELDS).not.toContain('supportsMaxOutputTokens')
    for (const field of ALPHA1_PLUS_COMPAT_FIELDS) expect(ALPHA3_PLUS_COMPAT_FIELDS).toContain(field)
  })

  it('offers exactly the wire spellings DSH accepts for the thinking budget field', () => {
    // DSH 的 THINKING_TOKEN_BUDGET_FIELDS 只认这三个拼写；多一个字面量会被
    // DSH 的 schema 拒绝，少一个则用户无法选到该拼写。
    expect(ALPHA3_PLUS_COMPAT_FIELDS).toContain('thinkingTokenBudgetField')
    const spec = GATEWAY_COMPAT_FIELDS.thinkingTokenBudgetField
    expect(spec.kind).toBe('enum')
    expect(spec.kind === 'enum' ? [...spec.enumValues] : []).toEqual([
      'thinking_token_budget', 'thinking_budget', 'thinking_budget_tokens',
    ])
  })

  it('gates the two new fields to the protocols DSH offers them on', () => {
    expect(fieldsForApi('openai-completions')).toContain('thinkingTokenBudgetField')
    expect(fieldsForApi('openai-completions')).not.toContain('supportsMaxOutputTokens')
    for (const api of ['openai-responses', 'azure-openai-responses', 'openai-codex-responses']) {
      expect(fieldsForApi(api)).toContain('supportsMaxOutputTokens')
      expect(fieldsForApi(api)).not.toContain('thinkingTokenBudgetField')
    }
  })

  it('exposes the two legacy fields and the new scalar ones in the declared groups', () => {
    for (const key of ['supportsDeveloperRole', 'maxTokensField', 'supportsStore', 'thinkingFormat', 'supportsThinkingTokenBudget'] as const) {
      expect(GATEWAY_COMPAT_FIELD_KEYS).toContain(key)
    }
  })
})

describe('numeric gateway compat fields', () => {
  const editable: GatewayCompatEditability = { vllmPriority: true, editableFields: ['vllmPriority'] }

  it('registers vllmPriority as a numeric field on completions only', () => {
    expect(GATEWAY_COMPAT_FIELDS.vllmPriority.kind).toBe('number')
    expect(GATEWAY_COMPAT_FIELDS.vllmPriority.protocols).toEqual(['openai-completions'])
    expect(fieldsForApi('openai-completions')).toContain('vllmPriority')
    expect(fieldsForApi('openai-responses')).not.toContain('vllmPriority')
  })

  it('declares the integer step DSH enforces, and only offers it from 0.1.3-alpha.2', () => {
    // DSH declares `vllmPriority` as `z.number().step(1)`, so the input step and
    // the write path must both be integer-based. The field arrived with the same
    // prerelease as `thinkingTokenBudgetField`/`supportsMaxOutputTokens`.
    const spec = GATEWAY_COMPAT_FIELDS.vllmPriority
    expect(spec.kind === 'number' ? spec.step : undefined).toBe(1)
    expect(ALPHA3_PLUS_COMPAT_FIELDS).toContain('vllmPriority')
    expect(ALPHA1_PLUS_COMPAT_FIELDS).not.toContain('vllmPriority')
    expect(RC8_COMPAT_FIELDS).not.toContain('vllmPriority')
  })

  it('keeps a finite numeric compat value from the layer chain', () => {
    expect(resolveGatewayCompat({ provider: 'local', modelCompat: { vllmPriority: 3 } }).vllmPriority)
      .toEqual({ value: 3, source: 'model' })
    // A non-number in the document is not a usable selection: DSH's own schema
    // would reject the mutate, so the reader drops it rather than echoing it.
    expect(resolveGatewayCompat({ provider: 'local', providerCompat: { vllmPriority: '3' } }).vllmPriority)
      .toEqual({ value: undefined, source: 'unknown' })
    expect(resolveGatewayCompat({ provider: 'local', providerCompat: { vllmPriority: Number.NaN } }).vllmPriority)
      .toEqual({ value: undefined, source: 'unknown' })
  })

  it('renders a numeric selection as its string form, and an absent one as auto', () => {
    expect(resolveModelGatewayCompat({ provider: 'local', model: 'model-a', modelCompat: { vllmPriority: 3 } }).vllmPriority).toBe('3')
    expect(resolveModelGatewayCompat({ provider: 'local', model: 'model-a' }).vllmPriority).toBe('auto')
  })

  it('round-trips a numeric string into a number set op and auto into an unset op', () => {
    expect(opsForProviderCompat('local', { vllmPriority: '3' }, editable)).toEqual([
      { op: 'set', path: ['providers', 'local', 'compat', 'vllmPriority'], value: 3 },
    ])
    expect(opsForProviderCompat('local', { vllmPriority: 'auto' }, editable)).toEqual([
      { op: 'unset', path: ['providers', 'local', 'compat', 'vllmPriority'] },
    ])
  })

  it('refuses a fractional or non-numeric selection for a number field', () => {
    // `step(1)` is a step, not a bound: DSH declares no min/max for this field,
    // so only integrality is enforced here.
    for (const value of ['abc', '1.5', '', '  ', 'Infinity', 'NaN']) {
      expect(opsForProviderCompat('local', { vllmPriority: value }, editable), value).toEqual([])
    }
  })
})
