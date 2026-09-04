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
import { inventoryFrom, modelCompatKey, modelGatewayCompatViewFrom, modelGatewayCompatViewsFrom, providerGatewayCompatViewFrom } from '../src/client/model-inventory.js'
import { mergeModelUpdate, opsForModelArrayCompat, opsForModelCompat, opsForProviderCompat, setOps } from '../src/client/model-ops.js'
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
import { hasLayeredModelSourceConflict, hasModelSourceConflict } from '../src/compat/model-source.js'
import { resolveGatewayCompat, resolveModelGatewayCompat, resolveProviderGatewayCompat } from '../src/compat/gateway/resolve.js'
import { editableProviderCompatFields, validateProviderCompat } from '../src/compat/gateway/validation.js'
import type { GatewayCompatEditability } from '../src/compat/gateway/types.js'
import { capabilitiesForVersion } from '../src/compat/version-map.js'
import { GATEWAY_COMPAT_FIELD_KEYS, ALPHA1_PLUS_COMPAT_FIELDS, RC8_COMPAT_FIELDS } from '../src/compat/gateway/fields.js'
import type { InventoryItem, ModelGatewayCompatUpdate, Translation } from '../src/client/types.js'
import type { TakeoverRuntimeResolution } from '../src/client/takeover-runtime.js'

const translate: Translation = (key, params) => `${key}${params?.level ? `:${params.level}` : ''}`

const realGatewaySchema = {
  uid: 6,
  refs: {
    '0': { type: 'boolean', meta: {} },
    '1': { type: 'string', meta: {} },
    '2': { type: 'object', meta: { default: {} }, dict: {
       supportsStore: 0,
       supportsDeveloperRole: 0,
       supportsReasoningEffort: 0,
       supportsUsageInStreaming: 0,
       supportsFinishReason: 0,
       requiresToolResultName: 0,
       requiresAssistantAfterToolResult: 0,
       requiresThinkingAsText: 0,
       requiresReasoningContentOnAssistantMessages: 0,
       supportsThinkingTokenBudget: 0,
       supportsStrictMode: 0,
       supportsLongCacheRetention: 0,
       maxTokensField: 1,
       thinkingFormat: 1,
       cacheControlFormat: 1,
     } },
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

describe('model source conflict protection', () => {
  it.each([
    ['value models and base overrides', { value: { providers: { provider: { models: [{ id: 'model' }] } } }, base: { providers: { provider: { modelOverrides: { model: {} } } } } }],
    ['base models and user overrides', { base: { providers: { provider: { models: [{ id: 'model' }] } } }, user: { providers: { provider: { modelOverrides: { model: {} } } } } }],
    ['user models and value overrides', { user: { providers: { provider: { models: [{ id: 'model' }] } } }, value: { providers: { provider: { modelOverrides: { model: {} } } } } }],
  ])('detects non-empty model sources split across %s', (_label, namespace) => {
    expect(hasLayeredModelSourceConflict(namespace, 'provider')).toBe(true)
  })

  it('ignores empty, inherited, and invalid layered model sources', () => {
    const inheritedOverrides = Object.create({ inherited: {} }) as Record<string, unknown>
    const inheritedProviders = Object.create({ provider: { models: [{ id: 'model' }] } }) as Record<string, unknown>

    expect(hasLayeredModelSourceConflict({
      value: { providers: { provider: { models: [], modelOverrides: { model: {} } } } },
      user: { providers: { provider: { models: [] } } },
    }, 'provider')).toBe(false)
    expect(hasLayeredModelSourceConflict({
      value: { providers: { provider: { models: [{ id: 'model' }], modelOverrides: {} } } },
      user: { providers: { provider: { modelOverrides: inheritedOverrides } } },
    }, 'provider')).toBe(false)
    expect(hasLayeredModelSourceConflict({
      value: { providers: { provider: { models: [{ id: 'model' }] } } },
      base: { providers: { provider: [] } },
      user: { providers: { provider: { modelOverrides: 1 } } },
    }, 'provider')).toBe(false)
    expect(hasLayeredModelSourceConflict({
      value: { providers: inheritedProviders },
      user: { providers: { provider: { modelOverrides: { model: {} } } } },
    }, 'provider')).toBe(false)
    expect(hasLayeredModelSourceConflict({
      value: { providers: { provider: { models: [{ id: 'model' }] } } },
      user: { providers: { provider: { modelOverrides: inheritedOverrides } } },
    }, 'other-provider')).toBe(false)
  })

  it('detects model source conflict only for non-empty models and own-key plain modelOverrides', () => {
    const inheritedOverrides = Object.create({ inherited: { compat: { supportsDeveloperRole: true } } }) as Record<string, unknown>
    const specialKeys = JSON.parse('{"models":[{"id":"__proto__"}],"modelOverrides":{"__proto__":{},"constructor":{},"toString":{}}}') as Record<string, unknown>

    expect(hasModelSourceConflict({ models: [{ id: 'model' }], modelOverrides: { model: {} } })).toBe(true)
    expect(hasModelSourceConflict(specialKeys)).toBe(true)
    expect(hasModelSourceConflict({ models: [], modelOverrides: { model: {} } })).toBe(false)
    expect(hasModelSourceConflict({ models: [{ id: 'model' }], modelOverrides: {} })).toBe(false)
    expect(hasModelSourceConflict({ models: [{ id: 'model' }], modelOverrides: inheritedOverrides })).toBe(false)
    expect(hasModelSourceConflict({ models: [{ id: 'model' }], modelOverrides: null })).toBe(false)
    expect(hasModelSourceConflict({ models: [{ id: 'model' }], modelOverrides: 'model' })).toBe(false)
    expect(hasModelSourceConflict({ models: [{ id: 'model' }], modelOverrides: 1 })).toBe(false)
    expect(hasModelSourceConflict(null)).toBe(false)
    expect(hasModelSourceConflict({ models: [{ id: 'model' }] })).toBe(false)
  })
})

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
  it('keeps route and model compat keys unambiguous', () => {
    expect(modelCompatKey('a', 'b/c')).not.toBe(modelCompatKey('a/b', 'c'))
  })

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

  it('preserves invalid models[] entries when saving a valid model update', () => {
    const namespace = {
      value: {
        providers: {
          provider: {
            models: [
              { id: 'model-a', custom: 'keep-a' },
              null,
              { id: 'model-b', custom: 'keep-b' },
              'unknown-entry',
            ],
          },
        },
      },
    }
    const inventory = inventoryFrom(namespace)
    const target = inventory.find((candidate) => candidate.model === 'model-b')
    expect(target).toBeDefined()
    expect(setOps(inventory, [{ item: target!, levels: { off: null, high: 'high' } }])).toEqual([{
      op: 'set',
      path: ['providers', 'provider', 'models'],
      value: [
        { id: 'model-a', custom: 'keep-a' },
        null,
        { id: 'model-b', custom: 'keep-b', reasoningEfforts: { off: null, high: 'high' } },
        'unknown-entry',
      ],
    }])
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
  it('replaces one models[] compat entry with a complete array while preserving every other value', () => {
    const target = item({ model: 'model-b', index: 1, raw: { id: 'model-b', compat: { maxTokensField: 'max_tokens', keep: 'yes' }, custom: 'keep-b' } })
    const other = item({ model: 'model-a', index: 0, raw: { id: 'model-a', custom: 'keep-a' } })
    const editable: GatewayCompatEditability = { supportsDeveloperRole: true, maxTokensField: true, editableFields: ['supportsDeveloperRole', 'maxTokensField'] }

    expect(opsForModelArrayCompat([other, target], target, { supportsDeveloperRole: 'unsupported' }, editable)).toEqual([{
      op: 'set',
      path: ['providers', 'provider', 'models'],
      value: [
        { id: 'model-a', custom: 'keep-a' },
        { id: 'model-b', compat: { maxTokensField: 'max_tokens', keep: 'yes', supportsDeveloperRole: false }, custom: 'keep-b' },
      ],
    }])
  })

  it('preserves own __proto__ keys in nested unknown fields during models[] compat saves', () => {
    const namespace = JSON.parse('{"value":{"providers":{"provider":{"models":[{"id":"model-a","metadata":{"__proto__":{"keep":"a"}}},{"id":"model-b","compat":{"other":{"__proto__":{"keep":"b"}}},"metadata":{"__proto__":{"keep":"target"}}}]}}}}') as Record<string, unknown>
    const inventory = inventoryFrom(namespace)
    const target = inventory.find((candidate) => candidate.model === 'model-b')
    const operations = opsForModelArrayCompat(inventory, target!, { supportsDeveloperRole: 'unsupported' }, { supportsDeveloperRole: true, maxTokensField: true })
    const models = operations[0]?.value as Array<Record<string, any>>

    expect(Object.prototype.hasOwnProperty.call(models[0]?.metadata, '__proto__')).toBe(true)
    expect(models[0]?.metadata?.['__proto__']).toEqual({ keep: 'a' })
    expect(Object.prototype.hasOwnProperty.call(models[1]?.metadata, '__proto__')).toBe(true)
    expect(models[1]?.metadata?.['__proto__']).toEqual({ keep: 'target' })
    expect(Object.prototype.hasOwnProperty.call(models[1]?.compat?.other, '__proto__')).toBe(true)
    expect(models[1]?.compat?.other?.['__proto__']).toEqual({ keep: 'b' })
  })

  it('preserves own __proto__ keys in nested unknown fields during base model saves', () => {
    const namespace = JSON.parse('{"value":{"providers":{"provider":{"models":[{"id":"model-a","metadata":{"__proto__":{"keep":"a"}}},{"id":"model-b","metadata":{"__proto__":{"keep":"target"}}}]}}}}') as Record<string, unknown>
    const inventory = inventoryFrom(namespace)
    const target = inventory.find((candidate) => candidate.model === 'model-b')
    const operations = setOps(inventory, [{ item: target!, levels: { off: null, high: 'high' } }])
    const models = operations[0]?.value as Array<Record<string, any>>

    expect(Object.prototype.hasOwnProperty.call(models[0]?.metadata, '__proto__')).toBe(true)
    expect(models[0]?.metadata?.['__proto__']).toEqual({ keep: 'a' })
    expect(Object.prototype.hasOwnProperty.call(models[1]?.metadata, '__proto__')).toBe(true)
    expect(models[1]?.metadata?.['__proto__']).toEqual({ keep: 'target' })
  })

  it('deletes only selected models[] compat fields and rejects invalid or mismatched inventory inputs', () => {
    const target = item({ model: 'model-b', index: 1, raw: { id: 'model-b', compat: { supportsDeveloperRole: true } } })
    const other = item({ model: 'model-a', index: 0, raw: { id: 'model-a', custom: 'keep-a' } })
    const editable: GatewayCompatEditability = { supportsDeveloperRole: true, maxTokensField: true, editableFields: ['supportsDeveloperRole', 'maxTokensField'] }

    expect(opsForModelArrayCompat([other, target], target, { supportsDeveloperRole: 'auto' }, editable)).toEqual([{
      op: 'set', path: ['providers', 'provider', 'models'], value: [other.raw, { id: 'model-b' }],
    }])
    expect(opsForModelArrayCompat([other, target], target, { maxTokensField: 'max_completion_tokens' }, editable)[0]?.value).toEqual([
      other.raw,
      { id: 'model-b', compat: { supportsDeveloperRole: true, maxTokensField: 'max_completion_tokens' } },
    ])
    expect(opsForModelArrayCompat([other, target], { ...target, index: 9 }, { supportsDeveloperRole: 'unsupported' }, editable)).toEqual([])
    expect(opsForModelArrayCompat([other, target], { ...target, model: 'missing' }, { supportsDeveloperRole: 'unsupported' }, editable)).toEqual([])
    expect(opsForModelArrayCompat([other, target], target, { supportsDeveloperRole: 'unsupported', maxTokensField: 'bogus' as never }, editable)).toEqual([])
    expect(opsForModelArrayCompat([other, target], { ...target, inOverrides: true }, { supportsDeveloperRole: 'unsupported' }, editable)).toEqual([])
    expect(opsForModelArrayCompat([other, target, { ...target, inOverrides: true, index: -1 }], target, { supportsDeveloperRole: 'unsupported' }, editable)).toEqual([])
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

  it('resolves the new scalar fields from catalog and protocol layers', () => {
    const result = resolveGatewayCompat({
      provider: 'local',
      model: 'model-a',
      providerCompat: { supportsStore: true, requiresThinkingAsText: true },
      catalogCompat: { supportsStore: false, supportsThinkingTokenBudget: true, thinkingFormat: 'deepseek' },
      protocolDefault: { thinkingFormat: 'openai', supportsUsageInStreaming: true },
    })
    expect(result.supportsStore).toEqual({ value: true, source: 'provider' })
    expect(result.requiresThinkingAsText).toEqual({ value: true, source: 'provider' })
    expect(result.supportsThinkingTokenBudget).toEqual({ value: true, source: 'catalog' })
    expect(result.thinkingFormat).toEqual({ value: 'deepseek', source: 'catalog' })
    expect(result.supportsUsageInStreaming).toEqual({ value: true, source: 'protocol' })
  })

  it('respects an explicit false editability flag over a resolved value', () => {
    const view = resolveModelGatewayCompat({
      provider: 'provider',
      model: 'model-a',
      catalogCompat: { supportsStore: true },
    }, {
      supportsStore: false,
    })
    expect(view.supportsStoreAvailable).toBe(false)
    expect(view.supportsStoreResolved).toBe(true)
  })

  it('treats an empty editableFields array as unavailable even when a value is resolved', () => {
    const view = resolveModelGatewayCompat({
      provider: 'provider',
      model: 'model-a',
      catalogCompat: { supportsStore: true },
    }, {
      editableFields: [],
    })
    expect(view.supportsStoreAvailable).toBe(false)
    expect(view.supportsStoreResolved).toBe(true)
  })

  it('falls back to resolved availability when editability is omitted', () => {
    const view = resolveModelGatewayCompat({
      provider: 'provider',
      model: 'model-a',
      catalogCompat: { supportsStore: true },
    })
    expect(view.supportsStoreAvailable).toBe(true)
    expect(view.supportsStoreResolved).toBe(true)
  })

  it('uses editableFields to decide availability for fields not listed in it', () => {
    const view = resolveModelGatewayCompat({
      provider: 'provider',
      model: 'model-a',
      catalogCompat: { supportsStore: true, maxTokensField: 'max_tokens' },
    }, {
      editableFields: ['maxTokensField'],
    })
    expect(view.supportsStoreAvailable).toBe(false)
    expect(view.maxTokensFieldAvailable).toBe(true)
  })

  it('projects resolved values onto the provider view alongside sources and availability', () => {
    expect(resolveProviderGatewayCompat({
      provider: 'local',
      providerCompat: { supportsStore: true, maxTokensField: 'max_tokens' },
      catalogCompat: { supportsStore: false },
    })).toMatchObject({
      provider: 'local',
      supportsStore: 'supported',
      supportsStoreResolved: true,
      maxTokensField: 'max_tokens',
      maxTokensFieldResolved: 'max_tokens',
    })
  })

  it('projects every registered scalar field when version and schema admit it', () => {
    const view = providerGatewayCompatViewFrom({
      value: { providers: { provider: { compat: { supportsStore: true } } } },
      schema: realGatewaySchema,
    }, 'provider', 'modern')

    expect(view.supportsStore).toBe('auto')
    expect(view.supportsStoreSource).toBe('catalog')
    expect(view.supportsStoreAvailable).toBe(true)
    expect(view.supportsThinkingTokenBudgetAvailable).toBe(true)
    expect(view.cacheControlFormatAvailable).toBe(true)
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
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'catalog',
      supportsDeveloperRoleResolved: false,
      maxTokensField: 'auto',
      maxTokensFieldSource: 'unknown',
    })
  })

  it('ignores inherited modelOverrides and projects special model keys', () => {
    const inheritedOverrides = Object.create({ inherited: { compat: { supportsDeveloperRole: true } } }) as Record<string, unknown>
    const namespace = {
      value: { providers: { provider: { models: [
        { id: 'model-a' },
        { id: '__proto__', compat: { supportsDeveloperRole: true } },
        { id: 'constructor', compat: { supportsDeveloperRole: false } },
      ] } } },
      user: { providers: { provider: { modelOverrides: inheritedOverrides } } },
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
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'catalog',
      supportsDeveloperRoleResolved: true,
    })
    expect(modelGatewayCompatViewFrom(namespace, models.find((candidate) => candidate.model === 'constructor')!, 'modern')).toMatchObject({
      model: 'constructor',
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'catalog',
      supportsDeveloperRoleResolved: false,
    })
  })

  it('fails closed for malformed gateway capability objects', () => {
    const malformed = { gatewayCompatFields: 'supportsDeveloperRole' } as unknown as Parameters<typeof editableProviderCompatFields>[0]
    const nullCapabilities = null as unknown as Parameters<typeof editableProviderCompatFields>[0]
    expect(editableProviderCompatFields(malformed, realGatewaySchema)).toEqual({
      editableFields: [],
    })
    expect(validateProviderCompat(malformed, realGatewaySchema)).toMatchObject({
      editableFields: [],
      available: false,
    })
    expect(editableProviderCompatFields(nullCapabilities, realGatewaySchema)).toEqual({
      editableFields: [],
    })
    expect(validateProviderCompat(nullCapabilities, realGatewaySchema)).toMatchObject({
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

  it('keeps model selections unset when values are inherited from provider', () => {
    expect(resolveModelGatewayCompat({
      provider: 'provider',
      model: 'model-a',
      providerCompat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
      protocolDefault: { supportsDeveloperRole: true, maxTokensField: 'max_completion_tokens' },
    })).toMatchObject({
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'provider',
      supportsDeveloperRoleResolved: false,
      maxTokensField: 'auto',
      maxTokensFieldSource: 'provider',
      maxTokensFieldResolved: 'max_tokens',
    })
  })

  it('uses only explicit model fields for model selection in mixed fallback layers', () => {
    expect(resolveModelGatewayCompat({
      provider: 'provider',
      model: 'model-a',
      modelCompat: { supportsDeveloperRole: true },
      providerCompat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
      baseCompat: { maxTokensField: 'max_completion_tokens' },
    })).toMatchObject({
      supportsDeveloperRole: 'supported',
      supportsDeveloperRoleSource: 'model',
      supportsDeveloperRoleResolved: true,
      maxTokensField: 'auto',
      maxTokensFieldSource: 'provider',
      maxTokensFieldResolved: 'max_tokens',
    })
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

  it('fails closed when models[] and modelOverrides are split across descriptor layers', () => {
    const namespace = {
      value: {
        providers: {
          provider: {
            models: [{ id: 'model-a', compat: { supportsDeveloperRole: true } }],
          },
        },
      },
      user: {
        providers: {
          provider: {
            modelOverrides: { 'model-a': { compat: { supportsDeveloperRole: false } } },
          },
        },
      },
      schema: realGatewaySchema,
    }
    const inventory = inventoryFrom(namespace)
    const model = inventory.find((candidate) => candidate.model === 'model-a')
    expect(model).toBeDefined()

    expect(modelGatewayCompatViewsFrom(namespace, inventory, 'modern')).toEqual({})
    expect(opsForModelArrayCompat(inventory, model!, { supportsDeveloperRole: 'unsupported' }, {
      supportsDeveloperRole: true,
      maxTokensField: true,
    })).toEqual([])
  })

  it('fails closed for model source conflict between models[] and modelOverrides', () => {
    const namespace = {
      value: {
        providers: {
          provider: {
            compat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
            models: [{ id: 'model-a', compat: { supportsDeveloperRole: true } }],
            modelOverrides: { 'model-a': { compat: { supportsDeveloperRole: false } } },
          },
        },
      },
      user: {
        providers: {
          provider: {
            compat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
            models: [{ id: 'model-a', compat: { supportsDeveloperRole: true } }],
            modelOverrides: { 'model-a': { compat: { supportsDeveloperRole: false } } },
          },
        },
      },
      schema: realGatewaySchema,
    }

    expect(modelGatewayCompatViewFrom(namespace, item({ raw: { id: 'model-a', compat: { supportsDeveloperRole: true } } }), 'modern')).toMatchObject({
      model: 'model-a',
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'provider',
      supportsDeveloperRoleResolved: false,
      maxTokensField: 'auto',
      maxTokensFieldSource: 'provider',
      maxTokensFieldResolved: 'max_tokens',
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

  it('keeps models[] selections automatic when value snapshots contain inherited compat', () => {
    const ns = {
      value: {
        providers: {
          provider: {
            compat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
            models: [{ id: 'model-a', compat: { supportsDeveloperRole: true, maxTokensField: 'max_completion_tokens' } }],
          },
        },
      },
      user: {
        providers: {
          provider: {
            models: [{ id: 'model-a' }],
          },
        },
      },
      base: {
        providers: {
          provider: {
            compat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
            models: [{ id: 'model-a' }],
          },
        },
      },
      schema: realGatewaySchema,
    }
    const model = inventoryFrom(ns)[0]
    expect(model).toBeDefined()

    expect(modelGatewayCompatViewFrom(ns, model!, 'modern')).toMatchObject({
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'base',
      supportsDeveloperRoleResolved: false,
      maxTokensField: 'auto',
      maxTokensFieldSource: 'base',
      maxTokensFieldResolved: 'max_tokens',
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
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'catalog',
      supportsDeveloperRoleResolved: false,
      maxTokensField: 'auto',
      maxTokensFieldSource: 'catalog',
      maxTokensFieldResolved: 'max_tokens',
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
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'catalog',
      supportsDeveloperRoleResolved: false,
    })
  })

  it('uses namespace layers instead of treating a non-protocol takeover hit as a model override', () => {
    const namespace = {
      value: { providers: { provider: { models: [{ id: 'model-a' }], compat: { supportsDeveloperRole: false } } } },
      schema: realGatewaySchema,
    }
    const runtime: TakeoverRuntimeResolution = {
      providers: ['provider'],
      compat: [{
        provider: 'provider',
        model: 'model-a',
        thinkingFormat: { value: undefined, source: 'unknown' },
        supportsReasoningEffort: { value: undefined, source: 'unknown' },
        supportsDeveloperRole: { value: true, source: 'model' },
        maxTokensField: { value: 'max_completion_tokens', source: 'provider' },
      }],
    }

    expect(modelGatewayCompatViewFrom(namespace, inventoryFrom(namespace)[0]!, 'modern', runtime)).toMatchObject({
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleSource: 'catalog',
      supportsDeveloperRoleResolved: false,
      maxTokensField: 'auto',
      maxTokensFieldSource: 'unknown',
      maxTokensFieldResolved: undefined,
    })
  })

  it('returns a provider view without applying model-level overrides', () => {
    expect(resolveProviderGatewayCompat({
      provider: 'local',
      model: 'model-a',
      modelCompat: { maxTokensField: 'max_tokens' },
      providerCompat: { maxTokensField: 'max_completion_tokens', supportsDeveloperRole: true },
    })).toMatchObject({
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
    const result = editableProviderCompatFields('modern', realGatewaySchema)
    expect(result.editableFields).toEqual(GATEWAY_COMPAT_FIELD_KEYS)
    expect(result).toMatchObject(Object.fromEntries(GATEWAY_COMPAT_FIELD_KEYS.map((field) => [field, true])))
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
      editableFields: [],
      available: false,
    })
    expect(validateProviderCompat(capabilitiesForVersion('0.1.0-rc.8'), {})).toMatchObject({
      editableFields: [],
      available: false,
    })
    const rc8Schema = {
      properties: {
        providers: {
          additionalProperties: {
            properties: {
              compat: { properties: Object.fromEntries(RC8_COMPAT_FIELDS.map((field) => [field, {}])) },
            },
          },
        },
      },
    }
    expect(editableProviderCompatFields(capabilitiesForVersion('0.1.0-rc.8'), rc8Schema).editableFields)
      .toEqual(GATEWAY_COMPAT_FIELD_KEYS.filter((field) => RC8_COMPAT_FIELDS.includes(field as typeof RC8_COMPAT_FIELDS[number])))
  })

  it('keeps aggregate provider availability true for rc8 with alpha-only schema fields excluded', () => {
    const result = validateProviderCompat(capabilitiesForVersion('0.1.0-rc.8'), realGatewaySchema)
    expect(result.available).toBe(true)
    expect(result.editableFields).toEqual(GATEWAY_COMPAT_FIELD_KEYS.filter((field) => RC8_COMPAT_FIELDS.includes(field as typeof RC8_COMPAT_FIELDS[number])))
    expect(result.supportsFinishReason).toBeUndefined()
    expect(result.supportsThinkingTokenBudget).toBeUndefined()
  })

  it('refuses provider compat writes when editability is missing or unclear', () => {
    const update = { supportsDeveloperRole: 'supported' as const, maxTokensField: 'max_tokens' as const }
    expect(opsForProviderCompat('local', update)).toEqual([])
    expect(opsForProviderCompat('local', update, { supportsDeveloperRole: true })).toEqual([])
  })

  it('validates provider compat updates atomically and keeps fields independent', () => {
    expect(opsForProviderCompat('local', {
      supportsDeveloperRole: 'supported',
      maxTokensField: 'invalid' as ModelGatewayCompatUpdate['maxTokensField'],
    }, { supportsDeveloperRole: true, maxTokensField: true })).toEqual([])
    expect(opsForProviderCompat('local', {
      supportsDeveloperRole: 'supported',
      maxTokensField: 'max_tokens',
    }, { supportsDeveloperRole: true, maxTokensField: false })).toEqual([])
    expect(opsForProviderCompat('local', {
      supportsDeveloperRole: 'supported',
    }, { supportsDeveloperRole: true, maxTokensField: false })).toEqual([
      { op: 'set', path: ['providers', 'local', 'compat', 'supportsDeveloperRole'], value: true },
    ])
    expect(opsForProviderCompat('local', {
      maxTokensField: 'max_tokens',
    }, { supportsDeveloperRole: false, maxTokensField: true })).toEqual([
      { op: 'set', path: ['providers', 'local', 'compat', 'maxTokensField'], value: 'max_tokens' },
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

  it('modelOverrides helper rejects models[] items and fails closed for invalid input', () => {
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
