import { describe, expect, it, vi } from 'vitest'

import {
  ALL_LEVELS,
  CONTEXT_1M,
  CONTEXT_MAX,
  CONTEXT_MIN,
  DEFAULT_LEVELS,
  INPUT_MODALITIES,
  LOCALE_NS,
  NS,
  PRESETS,
} from '../src/client/constants.js'
import { directResult, settingsBridge } from '../src/client/settings-bridge.js'
import { LOCALE_DATA, LOCALE_CODES } from '../src/client/locales.js'
import { inventoryFrom, modelGatewayCompatViewFrom, providerGatewayCompatViewFrom } from '../src/client/model-inventory.js'
import { mergeModelUpdate, opsForModelCompat, opsForProviderCompat, setOps } from '../src/client/model-ops.js'
import {
  buildInput,
  buildLevels,
  contextDraftFrom,
  draftFrom,
  inputDraftFrom,
  validateContextWindow,
  validateLevels,
} from '../src/client/validation.js'
import { iosPalette } from '../src/client/theme.js'
import { resolveGatewayCompat, resolveProviderGatewayCompat } from '../src/compat/gateway/resolve.js'
import { editableProviderCompatFields, validateProviderCompat } from '../src/compat/gateway/validation.js'
import type { GatewayCompatEditability } from '../src/compat/gateway/types.js'
import { capabilitiesForVersion } from '../src/compat/version-map.js'
import type { InventoryItem, ModelGatewayCompatUpdate, Translation } from '../src/client/types.js'
import type { TakeoverRuntimeResolution } from '../src/client/takeover-runtime.js'

const translate: Translation = (key, params) => `${key}${params?.level ? `:${params.level}` : ''}`

const realGatewaySchema = {
  uid: 6,
  refs: {
    '0': { type: 'boolean', meta: {} },
    '1': { type: 'string', meta: {} },
    '2': { type: 'object', meta: { default: {} }, dict: { supportsDeveloperRole: 0, maxTokensField: 1 } },
    '3': { type: 'object', meta: { default: {} }, dict: { compat: 2 } },
    '4': { type: 'dict', meta: { default: {} }, inner: 3, sKey: 5 },
    '5': { type: 'string', meta: {} },
    '6': { type: 'object', meta: { default: {} }, dict: { providers: 4 } },
  },
} as const

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    route: 'provider',
    model: 'model-a',
    name: 'Model A',
    levels: { off: null, high: 'high' },
    contextWindow: 8192,
    input: ['text'],
    raw: { id: 'model-a', providerOnly: true, reasoningEfforts: { off: null, high: 'high' } },
    index: 0,
    inOverrides: false,
    ...overrides,
  }
}

describe('client constants and bridge', () => {
  it('keeps the settings and input contracts stable', () => {
    expect(ALL_LEVELS).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
    expect(DEFAULT_LEVELS).toEqual({ off: null, high: 'high', max: 'max' })
    expect(PRESETS).toHaveLength(2)
    expect(NS).toBe('llm-pi-ai')
    expect(LOCALE_NS).toBe('settings.thinkingEffort')
    expect(CONTEXT_MIN).toBe(2000)
    expect(CONTEXT_MAX).toBe(1000000)
    expect(CONTEXT_1M).toBe(1000000)
    expect(INPUT_MODALITIES).toEqual(['text', 'image'])
  })

  it('normalizes direct and legacy wrapped results', () => {
    const value = { ok: true as const, value: { revision: 1 } }
    expect(directResult({ result: value })).toEqual(value)
    expect(directResult(value)).toEqual(value)
  })

  it('uses modern direct settings calls', async () => {
    const describe = vi.fn().mockResolvedValue({ result: { ok: true, value: { namespaces: [] } } })
    const mutate = vi.fn().mockResolvedValue({ ok: true, value: { ns: NS } })
    const api = settingsBridge({}, { describe, mutate })

    expect(api).toBeDefined()
    expect(api?.compatibilityProfile).toBe('modern')
    await expect(api?.describe()).resolves.toEqual({ ok: true, value: { namespaces: [] } })
    await expect(api?.mutate(NS, [], 4)).resolves.toEqual({ ok: true, value: { ns: NS } })
    expect(describe).toHaveBeenCalledWith()
    expect(mutate).toHaveBeenCalledWith(NS, [], 4)
  })

  it('prefers legacy settings when both settings APIs are available', async () => {
    const legacyDescribe = vi.fn().mockResolvedValue({ result: { ok: true, value: { namespaces: [] } } })
    const legacyMutate = vi.fn().mockResolvedValue({ result: { ok: true, value: { ns: NS } } })
    const modernDescribe = vi.fn().mockResolvedValue({ ok: true, value: { namespaces: [] } })
    const modernMutate = vi.fn().mockResolvedValue({ ok: true, value: { ns: NS } })
    const api = settingsBridge(
      { api: { settings: { describe: legacyDescribe, mutate: legacyMutate } } },
      { describe: modernDescribe, mutate: modernMutate },
      () => undefined,
    )

    expect(api).toBeDefined()
    expect(api?.externalLanguages).toBe(true)
    await api?.describe()
    await api?.mutate(NS, [], 9)
    expect(legacyDescribe).toHaveBeenCalledWith({})
    expect(legacyMutate).toHaveBeenCalledWith({ ns: NS, ops: [], expectedRevision: 9 })
    expect(modernDescribe).not.toHaveBeenCalled()
    expect(modernMutate).not.toHaveBeenCalled()
  })
  it('uses legacy wrapped settings calls when modern settings are absent', async () => {
    const describe = vi.fn().mockResolvedValue({ result: { ok: true, value: { namespaces: [] } } })
    const mutate = vi.fn().mockResolvedValue({ result: { ok: true, value: { ns: NS } } })
    const api = settingsBridge({ api: { settings: { describe, mutate } } })

    expect(api).toBeDefined()
    await api?.describe()
    await api?.mutate(NS, [], 7)
    expect(describe).toHaveBeenCalledWith({})
    expect(mutate).toHaveBeenCalledWith({ ns: NS, ops: [], expectedRevision: 7 })
  })
})

describe('model inventory and operations', () => {
  it('preserves route, model, name, raw, index, and override provenance', () => {
    const ns = {
      value: {
        providers: {
          provider: {
            models: [{ id: 'model-a', name: 'Readable', unknown: 1 }, { id: 'model-b' }],
            modelOverrides: { 'model-a': { name: 'Override', custom: true } },
          },
        },
      },
    }
    expect(inventoryFrom(ns)).toEqual([
      expect.objectContaining({ route: 'provider', model: 'model-a', name: 'Readable', index: 0, inOverrides: false }),
      expect.objectContaining({ route: 'provider', model: 'model-b', name: 'model-b', index: 1, inOverrides: false }),
      expect.objectContaining({ route: 'provider', model: 'model-a', name: 'Override', index: -1, inOverrides: true }),
    ])
    expect(inventoryFrom(ns)[0]?.raw).toEqual({ id: 'model-a', name: 'Readable', unknown: 1 })
  })

  it('merges edited fields while retaining unknown raw fields', () => {
    expect(mergeModelUpdate({ id: 'model-a', unknown: { keep: true } }, {
      item: item(),
      levels: { off: null, low: 'low' },
      contextWindow: 16384,
      contextWindowTouched: true,
      input: ['text', 'image'],
      inputTouched: true,
    })).toEqual({
      id: 'model-a',
      unknown: { keep: true },
      reasoningEfforts: { off: null, low: 'low' },
      contextWindow: 16384,
      input: ['text', 'image'],
    })
  })

  it('replaces each route model collection as one operation in original order', () => {
    const first = item({ model: 'first', index: 2, raw: { id: 'first', keep: 'first' } })
    const second = item({ model: 'second', index: 0, raw: { id: 'second', keep: 'second' } })
    const override = item({ model: 'override', inOverrides: true, index: -1, raw: { id: 'override', keep: true } })
    const updates = setOps([first, second, override], [
      { item: first, levels: { off: null, high: 'changed' } },
      { item: override, levels: { off: null, low: 'low' } },
    ])

    expect(updates).toEqual([
      {
        op: 'set',
        path: ['providers', 'provider', 'models'],
        value: [
          { id: 'second', keep: 'second' },
          { id: 'first', keep: 'first', reasoningEfforts: { off: null, high: 'changed' } },
        ],
      },
      {
        op: 'set',
        path: ['providers', 'provider', 'modelOverrides'],
        value: { override: { id: 'override', keep: true, reasoningEfforts: { off: null, low: 'low' } } },
      },
    ])
  })

  it('preserves special model IDs in override operations', () => {
    const namespace = JSON.parse(
      '{"value":{"providers":{"provider":{"modelOverrides":{"__proto__":{"id":"__proto__","keep":"proto"},"constructor":{"id":"constructor","keep":"constructor"},"toString":{"id":"toString","keep":"toString"}}}}}}',
    ) as Record<string, any>
    const overrides = namespace.value.providers.provider.modelOverrides as Record<string, any>
    Object.setPrototypeOf(overrides, { inherited: { id: 'inherited' } })

    const inventory = inventoryFrom(namespace)
    expect(inventory.map((entry) => entry.model)).toEqual(['__proto__', 'constructor', 'toString'])
    const proto = inventory.find((entry) => entry.model === '__proto__')
    const constructor = inventory.find((entry) => entry.model === 'constructor')
    const toString = inventory.find((entry) => entry.model === 'toString')
    expect(proto && constructor && toString).toBeTruthy()

    const operations = setOps(inventory, [
      { item: proto!, levels: { off: null, high: 'proto-high' } },
      { item: constructor!, levels: { off: null, high: 'constructor-high' } },
      { item: toString!, levels: { off: null, high: 'to-string-high' } },
    ])
    const result = operations[0]?.value as Record<string, Record<string, unknown>>

    expect(Object.keys(result)).toEqual(['__proto__', 'constructor', 'toString'])
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(result['__proto__']).toEqual({ id: '__proto__', keep: 'proto', reasoningEfforts: { off: null, high: 'proto-high' } })
    expect(result.constructor).toEqual({ id: 'constructor', keep: 'constructor', reasoningEfforts: { off: null, high: 'constructor-high' } })
    expect(result.toString).toEqual({ id: 'toString', keep: 'toString', reasoningEfforts: { off: null, high: 'to-string-high' } })
  })
  it('writes provider compat fields independently for supported and unsupported values', () => {
    const editable: GatewayCompatEditability = { supportsDeveloperRole: true, maxTokensField: true, editableFields: ['supportsDeveloperRole', 'maxTokensField'] }
    expect(opsForProviderCompat('local', {
      supportsDeveloperRole: 'unsupported',
      maxTokensField: 'max_tokens',
    }, editable)).toEqual([
      { op: 'set', path: ['providers', 'local', 'compat', 'supportsDeveloperRole'], value: false },
      { op: 'set', path: ['providers', 'local', 'compat', 'maxTokensField'], value: 'max_tokens' },
    ])

    expect(opsForProviderCompat('local', {
      supportsDeveloperRole: 'auto',
      maxTokensField: 'auto',
    }, editable)).toEqual([
      { op: 'unset', path: ['providers', 'local', 'compat', 'supportsDeveloperRole'] },
      { op: 'unset', path: ['providers', 'local', 'compat', 'maxTokensField'] },
    ])
  })

  it('does not replace unrelated provider compat fields', () => {
    expect(opsForProviderCompat('local', { supportsDeveloperRole: 'supported' }, {
      supportsDeveloperRole: true,
      maxTokensField: true,
    })).toEqual([
      { op: 'set', path: ['providers', 'local', 'compat', 'supportsDeveloperRole'], value: true },
    ])
  })
  it('resolves each compat field from model to provider to catalog to protocol', () => {
    const result = resolveGatewayCompat({
      provider: 'local',
      model: 'model-a',
      modelCompat: { maxTokensField: 'max_tokens' },
      providerCompat: { supportsDeveloperRole: false },
      catalogCompat: { thinkingFormat: 'deepseek', supportsReasoningEffort: false },
      protocolDefault: { maxTokensField: 'max_completion_tokens' },
    })

    expect(result.maxTokensField).toEqual({ value: 'max_tokens', source: 'model' })
    expect(result.supportsDeveloperRole).toEqual({ value: false, source: 'provider' })
    expect(result.thinkingFormat).toEqual({ value: 'deepseek', source: 'catalog' })
    expect(result.supportsReasoningEffort).toEqual({ value: false, source: 'catalog' })
    expect(result.model).toBe('model-a')
  })

  it('keeps model-b compat isolated from model-a and the provider view', () => {
    const namespace = {
      value: {
        providers: {
          provider: {
            compat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
            models: [
              { id: 'model-a' },
              { id: 'model-b', compat: { maxTokensField: 'max_completion_tokens' } },
            ],
          },
        },
      },
      user: {
        providers: {
          provider: {
            compat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
            models: [
              { id: 'model-a' },
              { id: 'model-b', compat: { maxTokensField: 'max_completion_tokens' } },
            ],
          },
        },
      },
      schema: realGatewaySchema,
    }
    const models = inventoryFrom(namespace)
    const modelA = models.find((candidate) => candidate.model === 'model-a')
    const modelB = models.find((candidate) => candidate.model === 'model-b')
    expect(modelA).toBeDefined()
    expect(modelB).toBeDefined()

    expect(modelGatewayCompatViewFrom(namespace, modelA!, 'modern')).toMatchObject({
      model: 'model-a',
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'provider',
      supportsDeveloperRoleResolved: false,
      maxTokensField: 'auto',
      maxTokensFieldSource: 'provider',
      maxTokensFieldResolved: 'max_tokens',
    })
    expect(modelGatewayCompatViewFrom(namespace, modelB!, 'modern')).toMatchObject({
      model: 'model-b',
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'provider',
      supportsDeveloperRoleResolved: false,
      maxTokensField: 'max_completion_tokens',
      maxTokensFieldSource: 'model',
      maxTokensFieldResolved: 'max_completion_tokens',
    })
    expect(providerGatewayCompatViewFrom(namespace, 'provider', 'modern')).toMatchObject({
      supportsDeveloperRole: 'unsupported',
      maxTokensField: 'max_tokens',
      maxTokensFieldSource: 'provider',
    })
  })

  it('ignores takeover runtime resolutions from another provider', () => {
    const namespace = {
      value: {
        providers: {
          provider: {
            models: [{ id: 'model-a', compat: { supportsDeveloperRole: false } }],
          },
        },
      },
      schema: realGatewaySchema,
    }
    const runtime: TakeoverRuntimeResolution = {
      providers: ['other-provider'],
      compat: [{
        provider: 'other-provider',
        model: 'model-a',
        thinkingFormat: { value: undefined, source: 'unknown' },
        supportsReasoningEffort: { value: undefined, source: 'unknown' },
        supportsDeveloperRole: { value: true, source: 'model' },
        maxTokensField: { value: 'max_completion_tokens', source: 'model' },
      }],
    }
    const model = inventoryFrom(namespace)[0]
    expect(model).toBeDefined()
    expect(modelGatewayCompatViewFrom(namespace, model!, 'modern', runtime)).toMatchObject({
      provider: 'provider',
      model: 'model-a',
      supportsDeveloperRole: 'unsupported',
      supportsDeveloperRoleSource: 'catalog',
      supportsDeveloperRoleResolved: false,
      maxTokensField: 'auto',
      maxTokensFieldSource: 'unknown',
    })
  })

  it('stops at malformed own modelOverrides entries and projects special model keys', () => {
    const overrides: Record<string, unknown> = Object.create(null)
    Object.defineProperty(overrides, '__proto__', {
      configurable: true,
      enumerable: true,
      value: { compat: { supportsDeveloperRole: true } },
      writable: true,
    })
    overrides.constructor = { compat: { supportsDeveloperRole: false } }
    const namespace = {
      value: { providers: { provider: { models: [{ id: 'model-a' }, { id: '__proto__' }, { id: 'constructor' }] } } },
      user: { providers: { provider: { models: [{ id: 'model-a', compat: { supportsDeveloperRole: true } }], modelOverrides: { 'model-a': null, ...overrides } } } },
      schema: realGatewaySchema,
    }
    const models = inventoryFrom(namespace).filter((candidate) => !candidate.inOverrides)

    expect(modelGatewayCompatViewFrom(namespace, models.find((candidate) => candidate.model === 'model-a')!, 'modern')).toMatchObject({
      model: 'model-a',
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'unknown',
      supportsDeveloperRoleResolved: undefined,
    })
    expect(modelGatewayCompatViewFrom(namespace, models.find((candidate) => candidate.model === '__proto__')!, 'modern')).toMatchObject({
      model: '__proto__',
      supportsDeveloperRole: 'supported',
      supportsDeveloperRoleSource: 'model',
      supportsDeveloperRoleResolved: true,
    })
    expect(modelGatewayCompatViewFrom(namespace, models.find((candidate) => candidate.model === 'constructor')!, 'modern')).toMatchObject({
      model: 'constructor',
      supportsDeveloperRole: 'unsupported',
      supportsDeveloperRoleSource: 'model',
      supportsDeveloperRoleResolved: false,
    })
  })

  it('fails closed for malformed gateway capability objects', () => {
    const malformed = { gatewayCompatFields: 'supportsDeveloperRole' } as unknown as Parameters<typeof editableProviderCompatFields>[0]
    const nullCapabilities = null as unknown as Parameters<typeof editableProviderCompatFields>[0]
    expect(editableProviderCompatFields(malformed, realGatewaySchema)).toEqual({
      supportsDeveloperRole: false,
      maxTokensField: false,
      editableFields: [],
    })
    expect(validateProviderCompat(malformed, realGatewaySchema)).toMatchObject({
      supportsDeveloperRole: false,
      maxTokensField: false,
      editableFields: [],
      available: false,
    })
    expect(editableProviderCompatFields(nullCapabilities, realGatewaySchema)).toEqual({
      supportsDeveloperRole: false,
      maxTokensField: false,
      editableFields: [],
    })
    expect(validateProviderCompat(nullCapabilities, realGatewaySchema)).toMatchObject({
      supportsDeveloperRole: false,
      maxTokensField: false,
      editableFields: [],
      available: false,
    })
  })

  it('resolves mixed gateway fields independently across every fallback layer', () => {
    const cases = [
      {
        field: 'supportsDeveloperRole' as const,
        input: { modelCompat: { supportsDeveloperRole: true }, providerCompat: { supportsDeveloperRole: false }, baseCompat: { supportsDeveloperRole: false }, catalogCompat: { supportsDeveloperRole: false }, protocolDefault: { supportsDeveloperRole: false } },
        expected: { value: true, source: 'model' },
      },
      {
        field: 'maxTokensField' as const,
        input: { providerCompat: { maxTokensField: 'max_tokens' }, baseCompat: { maxTokensField: 'max_completion_tokens' }, catalogCompat: { maxTokensField: 'max_completion_tokens' }, protocolDefault: { maxTokensField: 'max_completion_tokens' } },
        expected: { value: 'max_tokens', source: 'provider' },
      },
      {
        field: 'thinkingFormat' as const,
        input: { baseCompat: { thinkingFormat: 'deepseek' }, catalogCompat: { thinkingFormat: 'openai' }, protocolDefault: { thinkingFormat: 'qwen' } },
        expected: { value: 'deepseek', source: 'base' },
      },
      {
        field: 'supportsReasoningEffort' as const,
        input: { catalogCompat: { supportsReasoningEffort: false }, protocolDefault: { supportsReasoningEffort: true } },
        expected: { value: false, source: 'catalog' },
      },
      {
        field: 'thinkingFormat' as const,
        input: { protocolDefault: { thinkingFormat: 'qwen' } },
        expected: { value: 'qwen', source: 'protocol' },
      },
    ]

    for (const testCase of cases) {
      expect(resolveGatewayCompat({ provider: 'provider', ...testCase.input })[testCase.field]).toEqual(testCase.expected)
    }
  })

  it('resolves model compat before provider compat field by field', () => {
    const result = resolveGatewayCompat({
      provider: 'qwen-gateway',
      model: 'qwen-thinking',
      modelCompat: { supportsDeveloperRole: true },
      providerCompat: {
        supportsDeveloperRole: false,
        maxTokensField: 'max_tokens',
      },
      protocolDefault: { maxTokensField: 'max_completion_tokens' },
    })

    expect(result.supportsDeveloperRole).toEqual({ value: true, source: 'model' })
    expect(result.maxTokensField).toEqual({ value: 'max_tokens', source: 'provider' })
  })

  it('projects model compat while keeping provider compat isolated', () => {
    const namespace = {
      value: {
        providers: {
          'qwen-gateway': {
            compat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
            models: [{ id: 'qwen-thinking', compat: { supportsDeveloperRole: true } }],
          },
        },
      },
      user: {
        providers: {
          'qwen-gateway': {
            compat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
            models: [{ id: 'qwen-thinking', compat: { supportsDeveloperRole: true } }],
          },
        },
      },
      schema: realGatewaySchema,
    }

    expect(modelGatewayCompatViewFrom(namespace, item({ route: 'qwen-gateway', model: 'qwen-thinking', raw: { id: 'qwen-thinking' } }), 'modern')).toMatchObject({
      provider: 'qwen-gateway',
      model: 'qwen-thinking',
      supportsDeveloperRole: 'supported',
      supportsDeveloperRoleSource: 'model',
      maxTokensField: 'auto',
      maxTokensFieldSource: 'provider',
      supportsDeveloperRoleResolved: true,
      maxTokensFieldResolved: 'max_tokens',
    })
    expect(providerGatewayCompatViewFrom(namespace, 'qwen-gateway', 'modern')).toMatchObject({
      supportsDeveloperRole: 'unsupported',
      supportsDeveloperRoleSource: 'provider',
      maxTokensField: 'max_tokens',
      maxTokensFieldSource: 'provider',
    })
  })

  it('projects model compat from modelOverrides without changing provider compat', () => {
    const namespace = {
      value: {
        providers: {
          'qwen-gateway': {
            compat: { maxTokensField: 'max_completion_tokens' },
            modelOverrides: { 'qwen-thinking': { compat: { supportsDeveloperRole: true } } },
          },
        },
      },
      user: {
        providers: {
          'qwen-gateway': {
            compat: { maxTokensField: 'max_completion_tokens' },
            modelOverrides: { 'qwen-thinking': { compat: { supportsDeveloperRole: true } } },
          },
        },
      },
      schema: realGatewaySchema,
    }

    expect(modelGatewayCompatViewFrom(namespace, item({ route: 'qwen-gateway', model: 'qwen-thinking', raw: { id: 'qwen-thinking' } }), 'modern')).toMatchObject({
      supportsDeveloperRole: 'supported',
      supportsDeveloperRoleSource: 'model',
      maxTokensField: 'auto',
      maxTokensFieldSource: 'provider',
      supportsDeveloperRoleResolved: true,
      maxTokensFieldResolved: 'max_completion_tokens',
    })
    expect(providerGatewayCompatViewFrom(namespace, 'qwen-gateway', 'modern')).toMatchObject({
      supportsDeveloperRole: 'auto',
      maxTokensField: 'max_completion_tokens',
      maxTokensFieldSource: 'provider',
    })
  })

  it('keeps base provider and base model compat as independent resolver layers', () => {
    const namespace = {
      value: { providers: { 'qwen-gateway': { models: [{ id: 'qwen-thinking' }] } } },
      base: {
        providers: {
          'qwen-gateway': {
            compat: { supportsDeveloperRole: true },
            models: [{ id: 'qwen-thinking', compat: { supportsDeveloperRole: null } }],
          },
        },
      },
      schema: realGatewaySchema,
    }

    expect(modelGatewayCompatViewFrom(namespace, item({ route: 'qwen-gateway', model: 'qwen-thinking', raw: { id: 'qwen-thinking' } }), 'modern')).toMatchObject({
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'base',
      supportsDeveloperRoleResolved: true,
    })
  })

  it('resolves model catalog compat when user and base layers are absent', () => {
    const namespace = {
      value: {
        providers: {
          'qwen-gateway': {
            models: [{ id: 'qwen-thinking', compat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' } }],
          },
        },
      },
      schema: realGatewaySchema,
    }

    expect(modelGatewayCompatViewFrom(namespace, item({ route: 'qwen-gateway', model: 'qwen-thinking', raw: { id: 'qwen-thinking' } }), 'modern')).toMatchObject({
      supportsDeveloperRole: 'unsupported',
      supportsDeveloperRoleSource: 'catalog',
      maxTokensField: 'max_tokens',
      maxTokensFieldSource: 'catalog',
    })
  })

  it('resolves model compat protocol defaults supplied by matching takeover runtime', () => {
    const namespace = {
      value: { providers: { 'qwen-gateway': { models: [{ id: 'qwen-thinking' }] } } },
      schema: realGatewaySchema,
    }
    const runtime: TakeoverRuntimeResolution = {
      providers: ['qwen-gateway'],
      compat: [{
        provider: 'qwen-gateway',
        model: 'qwen-thinking',
        thinkingFormat: { value: undefined, source: 'unknown' },
        supportsReasoningEffort: { value: undefined, source: 'unknown' },
        supportsDeveloperRole: { value: true, source: 'protocol' },
        maxTokensField: { value: 'max_completion_tokens', source: 'protocol' },
      }],
    }

    expect(modelGatewayCompatViewFrom(
      namespace,
      item({ route: 'qwen-gateway', model: 'qwen-thinking', raw: { id: 'qwen-thinking' } }),
      'modern',
      runtime,
    )).toMatchObject({
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'protocol',
      maxTokensField: 'auto',
      maxTokensFieldSource: 'protocol',
      supportsDeveloperRoleResolved: true,
      maxTokensFieldResolved: 'max_completion_tokens',
    })
  })

  it('uses namespace compat when takeover runtime has no matching model', () => {
    const runtime: TakeoverRuntimeResolution = {
      providers: ['qwen-gateway'],
      compat: [{
        provider: 'qwen-gateway',
        model: 'other-model',
        thinkingFormat: { value: undefined, source: 'unknown' },
        supportsReasoningEffort: { value: undefined, source: 'unknown' },
        supportsDeveloperRole: { value: true, source: 'model' },
        maxTokensField: { value: 'max_completion_tokens', source: 'model' },
      }],
    }
    const namespace = {
      value: { providers: { 'qwen-gateway': { models: [{ id: 'qwen-thinking', compat: { supportsDeveloperRole: false } }] } } },
      schema: realGatewaySchema,
    }

    expect(modelGatewayCompatViewFrom(
      namespace,
      item({ route: 'qwen-gateway', model: 'qwen-thinking', raw: { id: 'qwen-thinking', compat: { supportsDeveloperRole: false } } }),
      'modern',
      runtime,
    )).toMatchObject({
      supportsDeveloperRole: 'unsupported',
      supportsDeveloperRoleSource: 'catalog',
    })
  })

  it('returns a provider view without applying model-level overrides', () => {
    expect(resolveProviderGatewayCompat({
      provider: 'local',
      model: 'model-a',
      modelCompat: { maxTokensField: 'max_tokens' },
      providerCompat: { maxTokensField: 'max_completion_tokens', supportsDeveloperRole: true },
    })).toEqual({
      provider: 'local',
      supportsDeveloperRole: 'supported',
      maxTokensField: 'max_completion_tokens',
      supportsDeveloperRoleSource: 'provider',
      maxTokensFieldSource: 'provider',
      supportsDeveloperRoleAvailable: true,
      maxTokensFieldAvailable: true,
      source: 'user',
    })
  })

  it('recognizes gateway fields in the real Settings schema.toJSON envelope', () => {
    expect(editableProviderCompatFields('modern', realGatewaySchema)).toEqual({
      supportsDeveloperRole: true,
      maxTokensField: true,
      editableFields: ['supportsDeveloperRole', 'maxTokensField'],
    })
  })

  it('shows only user overrides as explicit provider values and retains field provenance', () => {
    const view = providerGatewayCompatViewFrom({
      value: { providers: { provider: { compat: { supportsDeveloperRole: true, maxTokensField: 'max_tokens' } } } },
      user: { providers: { provider: { compat: { supportsDeveloperRole: false } } } },
      base: { providers: { provider: { compat: { maxTokensField: 'max_tokens' } } } },
      schema: realGatewaySchema,
    }, 'provider', 'modern')

    expect(view).toMatchObject({
      supportsDeveloperRole: 'unsupported',
      supportsDeveloperRoleSource: 'provider',
      maxTokensField: 'auto',
      maxTokensFieldSource: 'base',
    })
  })

  it('persists one changed field while the other remains inherited, and Auto unsets only that field', async () => {
    let namespace = {
      ns: 'llm-pi-ai',
      revision: 1,
      value: { providers: { provider: { compat: { supportsDeveloperRole: true, maxTokensField: 'max_tokens' } } } },
      user: { providers: { provider: { compat: { maxTokensField: 'max_completion_tokens' } } } },
      base: { providers: { provider: { compat: { supportsDeveloperRole: true, maxTokensField: 'max_tokens' } } } },
      schema: realGatewaySchema,
    }
    const describe = vi.fn(async () => ({ ok: true as const, value: { namespaces: [namespace] } }))
    const mutate = vi.fn(async (_ns: string, operations: readonly { op: 'set' | 'unset'; path: readonly string[]; value?: unknown }[], expectedRevision: number) => {
      expect(expectedRevision).toBe(namespace.revision)
      const userProvider = namespace.user.providers.provider as { compat?: Record<string, unknown> }
      const userCompat = userProvider.compat ??= {}
      for (const operation of operations) {
        const field = operation.path.at(-1)!
        if (operation.op === 'unset') delete userCompat[field]
        else userCompat[field] = operation.value
      }
      namespace = { ...namespace, revision: namespace.revision + 1 }
      return { ok: true as const, value: namespace }
    })
    const settings = { describe, mutate }

    const first = await settings.describe()
    const initial = providerGatewayCompatViewFrom(first.value.namespaces[0], 'provider', 'modern')
    expect(initial).toMatchObject({ supportsDeveloperRole: 'auto', supportsDeveloperRoleSource: 'base', maxTokensField: 'max_completion_tokens' })

    const oneFieldOps = opsForProviderCompat('provider', { maxTokensField: 'max_tokens' }, {
      supportsDeveloperRole: true,
      maxTokensField: true,
    })
    expect(oneFieldOps).toEqual([{ op: 'set', path: ['providers', 'provider', 'compat', 'maxTokensField'], value: 'max_tokens' }])
    await settings.mutate('llm-pi-ai', oneFieldOps, namespace.revision)

    const afterOneField = await settings.describe()
    const inherited = providerGatewayCompatViewFrom(afterOneField.value.namespaces[0], 'provider', 'modern')
    expect(inherited).toMatchObject({
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'base',
      maxTokensField: 'max_tokens',
      maxTokensFieldSource: 'provider',
    })

    const autoOps = opsForProviderCompat('provider', { maxTokensField: 'auto' }, {
      supportsDeveloperRole: true,
      maxTokensField: true,
    })
    expect(autoOps).toEqual([{ op: 'unset', path: ['providers', 'provider', 'compat', 'maxTokensField'] }])
    await settings.mutate('llm-pi-ai', autoOps, namespace.revision)

    const afterAuto = await settings.describe()
    expect(afterAuto.value.namespaces[0].user.providers.provider.compat.maxTokensField).toBeUndefined()
    expect(providerGatewayCompatViewFrom(afterAuto.value.namespaces[0], 'provider', 'modern')).toMatchObject({
      supportsDeveloperRole: 'auto',
      maxTokensField: 'auto',
      maxTokensFieldSource: 'base',
    })
    expect(mutate).toHaveBeenCalledTimes(2)
    expect(mutate.mock.calls[0]?.[1]).toEqual(oneFieldOps)
    expect(mutate.mock.calls[1]?.[1]).toEqual(autoOps)
  })

  it('does not let a model compat override change the provider-level view', () => {
    expect(resolveProviderGatewayCompat({
      provider: 'local',
      model: 'model-a',
      modelCompat: { maxTokensField: 'max_tokens', supportsDeveloperRole: false },
      providerCompat: { maxTokensField: 'max_completion_tokens', supportsDeveloperRole: true },
    })).toMatchObject({
      supportsDeveloperRole: 'supported',
      maxTokensField: 'max_completion_tokens',
      supportsDeveloperRoleSource: 'provider',
      maxTokensFieldSource: 'provider',
    })
  })

  it('shows modern gateway fields without versionCapabilities on the Settings wire', () => {
    const view = providerGatewayCompatViewFrom({
      value: { providers: { provider: { compat: { supportsDeveloperRole: true } } } },
      schema: realGatewaySchema,
    }, 'provider', 'modern')
    expect(view).toMatchObject({
      supportsDeveloperRoleAvailable: true,
      maxTokensFieldAvailable: true,
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'catalog',
    })
  })

  it('keeps gateway fields hidden for an unknown runtime even when schema contains them', () => {
    const view = providerGatewayCompatViewFrom({ schema: realGatewaySchema, value: { providers: { provider: {} } } }, 'provider', 'unknown')
    expect(view).toMatchObject({
      supportsDeveloperRoleAvailable: false,
      maxTokensFieldAvailable: false,
    })
  })

  it('requires both version capabilities and descriptor schema before allowing edits', () => {
    const schema = {
      properties: {
        providers: {
          additionalProperties: {
            properties: {
              compat: { properties: { supportsDeveloperRole: {}, maxTokensField: {} } },
            },
          },
        },
      },
    }
    const complete = editableProviderCompatFields(capabilitiesForVersion('0.1.0-rc.8'), schema)
    expect(complete).toEqual({
      supportsDeveloperRole: true,
      maxTokensField: true,
      editableFields: ['supportsDeveloperRole', 'maxTokensField'],
    })
    expect(validateProviderCompat(capabilitiesForVersion('0.1.0-rc.7'), schema)).toMatchObject({
      supportsDeveloperRole: false,
      maxTokensField: false,
      editableFields: [],
      available: false,
    })
    expect(validateProviderCompat(capabilitiesForVersion('0.1.0-rc.8'), {})).toMatchObject({
      supportsDeveloperRole: false,
      maxTokensField: false,
      available: false,
    })
  })

  it('refuses provider compat writes when editability is missing or unclear', () => {
    const update = { supportsDeveloperRole: 'supported' as const, maxTokensField: 'max_tokens' as const }
    expect(opsForProviderCompat('local', update)).toEqual([])
    expect(opsForProviderCompat('local', update, { supportsDeveloperRole: true })).toEqual([
      { op: 'set', path: ['providers', 'local', 'compat', 'supportsDeveloperRole'], value: true },
    ])
  })

  it('model compat operations write modelOverrides fields to exact model paths', () => {
    const editable: GatewayCompatEditability = {
      supportsDeveloperRole: true,
      maxTokensField: true,
      editableFields: ['supportsDeveloperRole', 'maxTokensField'],
    }

    expect(opsForModelCompat(item({ index: -1, model: 'qwen-thinking', inOverrides: true }), {
      supportsDeveloperRole: 'unsupported',
      maxTokensField: 'max_completion_tokens',
    }, editable)).toEqual([
      {
        op: 'set',
        path: ['providers', 'provider', 'modelOverrides', 'qwen-thinking', 'compat', 'supportsDeveloperRole'],
        value: false,
      },
      {
        op: 'set',
        path: ['providers', 'provider', 'modelOverrides', 'qwen-thinking', 'compat', 'maxTokensField'],
        value: 'max_completion_tokens',
      },
    ])
  })

  it('model compat operations unset modelOverrides fields independently for Auto', () => {
    const model = item({ index: -1, model: 'qwen-thinking', inOverrides: true })
    const editable: GatewayCompatEditability = {
      supportsDeveloperRole: true,
      maxTokensField: true,
      editableFields: ['supportsDeveloperRole', 'maxTokensField'],
    }

    expect(opsForModelCompat(model, {
      supportsDeveloperRole: 'auto',
      maxTokensField: 'auto',
    }, editable)).toEqual([
      { op: 'unset', path: ['providers', 'provider', 'modelOverrides', 'qwen-thinking', 'compat', 'supportsDeveloperRole'] },
      { op: 'unset', path: ['providers', 'provider', 'modelOverrides', 'qwen-thinking', 'compat', 'maxTokensField'] },
    ])
  })

  it('model compat operations reject models[] as YAML-only and fail closed for invalid input', () => {
    const editable: GatewayCompatEditability = {
      supportsDeveloperRole: true,
      maxTokensField: true,
      editableFields: ['supportsDeveloperRole', 'maxTokensField'],
    }
    const override = item({ index: -1, model: 'qwen-thinking', inOverrides: true })

    expect(opsForModelCompat(item({ index: 1, model: 'qwen-thinking' }), {
      supportsDeveloperRole: 'supported',
    }, editable)).toEqual([])
    expect(opsForModelCompat(item({ index: -1, model: 'qwen-thinking' }), {
      maxTokensField: 'max_tokens',
    }, editable)).toEqual([])
    expect(opsForModelCompat(item({ index: 1.5, model: 'qwen-thinking' }), {
      maxTokensField: 'max_tokens',
    }, editable)).toEqual([])
    expect(opsForModelCompat(item({ route: '   ', index: -1, model: 'qwen-thinking', inOverrides: true }), {
      maxTokensField: 'max_tokens',
    }, editable)).toEqual([])
    expect(opsForModelCompat(item({ index: -1, model: '   ', inOverrides: true }), {
      maxTokensField: 'max_tokens',
    }, editable)).toEqual([])
    expect(opsForModelCompat(override, { supportsDeveloperRole: 'supported' }, {
      supportsDeveloperRole: false,
      maxTokensField: true,
    })).toEqual([])
    expect(opsForModelCompat(override, {
      supportsDeveloperRole: 'supported',
      maxTokensField: 'invalid' as ModelGatewayCompatUpdate['maxTokensField'],
    }, editable)).toEqual([])
    expect(opsForModelCompat(override, { unknown: 'value' } as Partial<ModelGatewayCompatUpdate> & Record<string, unknown>, editable)).toEqual([])
  })

  it('checks each schema field independently', () => {
    const schema = { properties: { maxTokensField: {} } }
    const result = editableProviderCompatFields(capabilitiesForVersion('0.1.0-rc.8'), schema)
    expect(result).toEqual({
      supportsDeveloperRole: false,
      maxTokensField: true,
      editableFields: ['maxTokensField'],
    })
  })

  it('ignores unsupported thinking formats and does not infer them from endpoint metadata', () => {
    expect(resolveGatewayCompat({
      provider: 'local',
      modelCompat: { thinkingFormat: 'not-official' },
      providerCompat: { thinkingFormat: 'anthropic' },
      catalogCompat: { thinkingFormat: 'deepseek' },
    }).thinkingFormat).toEqual({ value: 'deepseek', source: 'catalog' })
    expect(resolveGatewayCompat({
      provider: 'anthropic',
    }).thinkingFormat).toEqual({ value: undefined, source: 'unknown' })
  })

  it('leaves deepseek and unknown URL compat fields unresolved', () => {
    expect(resolveGatewayCompat({
      provider: 'deepseek',
    })).toMatchObject({
      supportsDeveloperRole: { value: undefined, source: 'unknown' },
      supportsReasoningEffort: { value: undefined, source: 'unknown' },
      maxTokensField: { value: undefined, source: 'unknown' },
      thinkingFormat: { value: undefined, source: 'unknown' },
    })
    expect(resolveGatewayCompat({
      provider: 'local',
    })).toMatchObject({
      supportsDeveloperRole: { value: undefined, source: 'unknown' },
      maxTokensField: { value: undefined, source: 'unknown' },
      thinkingFormat: { value: undefined, source: 'unknown' },
    })
  })
})

describe('draft and validation helpers', () => {
  it('round-trips selected reasoning levels and fills off wire as null', () => {
    const draft = draftFrom({ off: null, minimal: 'minimal' })
    expect(draft.off).toEqual({ on: true, wire: '' })
    expect(draft.minimal).toEqual({ on: true, wire: 'minimal' })
    expect(buildLevels(draft)).toEqual({ off: null, minimal: 'minimal' })
  })

  it('builds and validates context and input drafts', () => {
    expect(contextDraftFrom({ contextWindow: CONTEXT_1M }).oneMillion).toBe(true)
    expect(validateContextWindow({ value: '1999', oneMillion: false }, translate)).toMatchObject({ error: expect.any(String) })
    expect(validateContextWindow({ value: '2000', oneMillion: false }, translate)).toEqual({ value: 2000 })
    expect(validateContextWindow({ value: '1000001', oneMillion: false }, translate)).toMatchObject({ error: expect.any(String) })
    expect(validateContextWindow({ value: 'abc', oneMillion: false }, translate)).toMatchObject({ error: expect.any(String) })
    expect(validateContextWindow({ value: '', oneMillion: false }, translate)).toEqual({ value: undefined })
    expect(validateContextWindow({ value: '', oneMillion: true }, translate)).toEqual({ value: CONTEXT_1M })

    expect(inputDraftFrom({ input: ['image'] })).toMatchObject({ text: false, image: true })
    expect(buildInput({ text: false, image: false }, translate)).toMatchObject({ error: expect.any(String) })
    expect(buildInput({ text: true, image: false }, translate)).toEqual({ value: ['text'] })
  })

  it('requires a non-off reasoning level and a non-empty wire value', () => {
    expect(validateLevels({ off: null }, translate)).toBe('atLeastThinking')
    expect(validateLevels({ off: null, low: '' }, translate)).toBe('levelNeedsValue:levelLow')
    expect(validateLevels({ off: null, low: 'low' }, translate)).toBeNull()
  })
})

describe('locales and theme', () => {
  it('keeps all locale dictionaries in parity', () => {
    const dictionaries = LOCALE_CODES.map((code) => LOCALE_DATA[code])
    const keys = Object.keys(dictionaries[0] ?? {}).sort()
    expect(dictionaries).toHaveLength(4)
    for (const dictionary of dictionaries) expect(Object.keys(dictionary).sort()).toEqual(keys)
    expect(Object.keys(dictionaries[0] ?? {})).toEqual(expect.arrayContaining(['title', 'languageJapanese', 'languageKorean']))
  })

  it('computes the existing light and dark palettes', () => {
    expect(iosPalette({ backgroundColor: 'rgb(28, 28, 30)', prefersDark: false }).canvas).toBe('#1C1C1E')
    expect(iosPalette({ backgroundColor: 'rgb(242, 242, 247)', prefersDark: false }).canvas).toBe('#F2F2F7')
  })
})
