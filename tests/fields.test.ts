import { describe, expect, it } from 'vitest'
import { ALPHA1_PLUS_COMPAT_FIELDS, GATEWAY_COMPAT_FIELDS, GATEWAY_COMPAT_FIELD_KEYS, GATEWAY_COMPAT_GROUPS, RC8_COMPAT_FIELDS, SUPPORTED_THINKING_FORMATS } from '../src/compat/gateway/fields.js'
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
    for (const field of RC8_COMPAT_FIELDS) expect(ALPHA1_PLUS_COMPAT_FIELDS).toContain(field) // 只多不少：ALPHA1_PLUS 至少包含 RC8 的全部字段
    expect(ALPHA1_PLUS_COMPAT_FIELDS).toContain('supportsFinishReason')
    expect(ALPHA1_PLUS_COMPAT_FIELDS).toContain('supportsThinkingTokenBudget')
    expect(RC8_COMPAT_FIELDS.length + 2).toBe(ALPHA1_PLUS_COMPAT_FIELDS.length)
  })

  it('exposes the two legacy fields and the new scalar ones in the declared groups', () => {
    for (const key of ['supportsDeveloperRole', 'maxTokensField', 'supportsStore', 'thinkingFormat', 'supportsThinkingTokenBudget'] as const) {
      expect(GATEWAY_COMPAT_FIELD_KEYS).toContain(key)
    }
  })
})
