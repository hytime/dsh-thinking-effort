import { describe, expect, it } from 'vitest'
import { fieldsForApi } from '../src/compat/gateway/fields.js'
import { opsForModelArrayCompat, opsForModelCompat, opsForProviderCompat } from '../src/compat/gateway/ops.js'
import { resolveGatewayCompat, resolveModelGatewayCompat } from '../src/compat/gateway/resolve.js'
import { editableProviderCompatFields } from '../src/compat/gateway/validation.js'
import { capabilitiesForVersion } from '../src/compat/version-map.js'
import type { GatewayCompatEditability } from '../src/compat/gateway/types.js'
import type { InventoryItem } from '../src/client/types.js'

const editable: GatewayCompatEditability = {
  preserveThinking: true,
  editableFields: ['preserveThinking'],
}

const templateSchema = {
  properties: {
    thinkingFormat: {},
    chatTemplateKwargs: {},
  },
}

const enableByEffort = { $var: 'thinking.enabled' } as const
const effortByLevel = { $var: 'thinking.effort', omitWhenOff: true } as const

function arrayItem(compat: Record<string, unknown>): InventoryItem {
  const raw = { id: 'qwen', compat }
  return {
    route: 'local',
    model: 'qwen',
    name: 'Qwen',
    levels: { off: null, high: 'high' },
    contextWindow: 8192,
    input: ['text'],
    raw,
    index: 0,
    inOverrides: false,
    modelsSnapshot: [raw],
  }
}

function overrideItem(): InventoryItem {
  return {
    ...arrayItem({}),
    index: -1,
    inOverrides: true,
    modelsSnapshot: undefined,
  }
}

describe('preserve_thinking gateway compat projection', () => {
  it('reads the nested boolean with model/provider precedence for generic templates', () => {
    expect(resolveGatewayCompat({
      provider: 'local',
      modelCompat: { thinkingFormat: 'chat-template', chatTemplateKwargs: { preserve_thinking: false } },
      providerCompat: { thinkingFormat: 'chat-template', chatTemplateKwargs: { preserve_thinking: true } },
    }).preserveThinking).toEqual({ value: false, source: 'model' })
    expect(resolveGatewayCompat({
      provider: 'local',
      providerCompat: { thinkingFormat: 'chat-template', chatTemplateKwargs: { preserve_thinking: true } },
    }).preserveThinking).toEqual({ value: true, source: 'provider' })
  })

  it('treats chatTemplateKwargs as one atomic field instead of inheriting nested keys', () => {
    expect(resolveGatewayCompat({
      provider: 'local',
      modelCompat: { chatTemplateKwargs: { custom_flag: 'keep' } },
      providerCompat: { thinkingFormat: 'chat-template', chatTemplateKwargs: { preserve_thinking: true } },
    }).preserveThinking).toEqual({ value: undefined, source: 'model' })
    expect(resolveGatewayCompat({
      provider: 'local',
      modelCompat: { chatTemplateKwargs: {} },
      providerCompat: { thinkingFormat: 'chat-template', chatTemplateKwargs: { enable_thinking: false, preserve_thinking: true } },
    }).preserveThinking).toEqual({ value: true, source: 'provider' })
    expect(resolveGatewayCompat({
      provider: 'local',
      providerCompat: { chatTemplateKwargs: {} },
      baseCompat: { thinkingFormat: 'chat-template', chatTemplateKwargs: { preserve_thinking: true } },
    }).preserveThinking).toEqual({ value: true, source: 'base' })
  })

  it('resolves the wire value from the effective thinking format', () => {
    expect(resolveGatewayCompat({
      provider: 'local',
      modelCompat: { thinkingFormat: 'qwen-chat-template' },
    }).preserveThinking).toEqual({ value: true, source: 'model' })
    expect(resolveGatewayCompat({
      provider: 'local',
      modelCompat: { thinkingFormat: 'qwen-chat-template' },
      providerCompat: { thinkingFormat: 'chat-template', chatTemplateKwargs: { preserve_thinking: false } },
    }).preserveThinking).toEqual({ value: true, source: 'model' })
    expect(resolveGatewayCompat({
      provider: 'local',
      modelCompat: { thinkingFormat: 'openai', chatTemplateKwargs: { preserve_thinking: true } },
    }).preserveThinking).toEqual({ value: undefined, source: 'unknown' })
    expect(resolveGatewayCompat({
      provider: 'local',
      modelCompat: { thinkingFormat: {} },
      providerCompat: { thinkingFormat: 'chat-template', chatTemplateKwargs: { preserve_thinking: true } },
    }).preserveThinking).toEqual({ value: true, source: 'provider' })
  })

  it('exposes Auto, enabled and disabled as a boolean model selection', () => {
    expect(resolveModelGatewayCompat({
      provider: 'local',
      model: 'qwen',
      modelCompat: { chatTemplateKwargs: { preserve_thinking: false } },
    }).preserveThinking).toBe('unsupported')
    expect(resolveModelGatewayCompat({ provider: 'local', model: 'qwen' }).preserveThinking).toBe('auto')
  })

  it('is offered only for OpenAI completions when the runtime schema supports templates', () => {
    expect(fieldsForApi('openai-completions')).toContain('preserveThinking')
    expect(fieldsForApi('openai-responses')).not.toContain('preserveThinking')
    const capabilities = capabilitiesForVersion('0.2.1-rc.5')
    expect(editableProviderCompatFields(capabilities, templateSchema, 'openai-completions').preserveThinking).toBe(true)
    expect(editableProviderCompatFields(capabilities, templateSchema, 'openai-responses').preserveThinking).toBeUndefined()
    expect(editableProviderCompatFields(capabilities, { properties: { thinkingFormat: {} } }, 'openai-completions').preserveThinking).toBeUndefined()
  })
})

describe('preserve_thinking write operations', () => {
  const prefix = ['providers', 'local', 'compat']

  it.each([
    ['supported', true],
    ['unsupported', false],
  ] as const)('installs the default NInfer template for %s when no template is active', (selection, preserved) => {
    expect(opsForProviderCompat('local', { preserveThinking: selection }, editable)).toEqual([
      { op: 'set', path: [...prefix, 'thinkingFormat'], value: 'chat-template' },
      { op: 'set', path: [...prefix, 'chatTemplateKwargs'], value: {
        enable_thinking: enableByEffort,
        reasoning_effort: effortByLevel,
        preserve_thinking: preserved,
      } },
    ])
  })

  it('changes only preserve on an existing generic template and retains custom reasoning mappings', () => {
    const chatTemplateKwargs = {
      enable_thinking: false,
      reasoning_effort: 'static-high',
      custom_flag: 'keep',
    }
    expect(opsForProviderCompat('local', { preserveThinking: 'supported' }, editable, {
      thinkingFormat: 'chat-template',
      chatTemplateKwargs,
    })).toEqual([
      { op: 'set', path: [...prefix, 'chatTemplateKwargs'], value: {
        ...chatTemplateKwargs,
        preserve_thinking: true,
      } },
    ])
  })

  it('does not invent missing effort mappings on an existing generic template', () => {
    expect(opsForProviderCompat('local', { preserveThinking: 'unsupported' }, editable, {
      thinkingFormat: 'chat-template',
      chatTemplateKwargs: { custom_flag: 'keep' },
    })).toEqual([
      { op: 'set', path: [...prefix, 'chatTemplateKwargs'], value: {
        custom_flag: 'keep',
        preserve_thinking: false,
      } },
    ])
  })

  it('retains existing kwargs when switching from another thinking format', () => {
    expect(opsForProviderCompat('local', { preserveThinking: 'supported' }, editable, {
      thinkingFormat: 'openai',
      chatTemplateKwargs: { enable_thinking: 'custom-enable', custom_flag: 'keep' },
    })).toEqual([
      { op: 'set', path: [...prefix, 'thinkingFormat'], value: 'chat-template' },
      { op: 'set', path: [...prefix, 'chatTemplateKwargs'], value: {
        enable_thinking: 'custom-enable',
        reasoning_effort: effortByLevel,
        custom_flag: 'keep',
        preserve_thinking: true,
      } },
    ])
  })

  it('honors an explicit preserve selection when thinkingFormat is reset in the same update', () => {
    const bothEditable: GatewayCompatEditability = {
      preserveThinking: true,
      thinkingFormat: true,
      editableFields: ['preserveThinking', 'thinkingFormat'],
    }
    const context = {
      thinkingFormat: 'chat-template',
      chatTemplateKwargs: { enable_thinking: 'custom-enable', preserve_thinking: true },
    }
    expect(opsForProviderCompat('local', { thinkingFormat: 'auto', preserveThinking: 'unsupported' }, bothEditable, context)).toEqual([
      { op: 'unset', path: [...prefix, 'thinkingFormat'] },
      { op: 'set', path: [...prefix, 'thinkingFormat'], value: 'chat-template' },
      { op: 'set', path: [...prefix, 'chatTemplateKwargs'], value: { enable_thinking: 'custom-enable', reasoning_effort: effortByLevel, preserve_thinking: false } },
    ])
    const item = arrayItem({ thinkingFormat: 'chat-template', chatTemplateKwargs: context.chatTemplateKwargs })
    const operations = opsForModelArrayCompat([item], item, { thinkingFormat: 'auto', preserveThinking: 'unsupported' }, bothEditable, context)
    const models = (operations[0] as { value: Array<Record<string, unknown>> }).value
    expect(models[0]).toEqual({
      id: 'qwen',
      compat: { thinkingFormat: 'chat-template', chatTemplateKwargs: { enable_thinking: 'custom-enable', reasoning_effort: effortByLevel, preserve_thinking: false } },
    })
  })

  it('Auto removes only the preserve override and leaves template/effort settings intact', () => {
    expect(opsForProviderCompat('local', { preserveThinking: 'auto' }, editable)).toEqual([
      { op: 'unset', path: [...prefix, 'chatTemplateKwargs', 'preserve_thinking'] },
    ])
  })

  it('uses the same non-destructive writes for modelOverrides', () => {
    expect(opsForModelCompat(overrideItem(), { preserveThinking: 'unsupported' }, editable, {
      thinkingFormat: 'chat-template',
      chatTemplateKwargs: { enable_thinking: true, reasoning_effort: 'custom' },
    })).toEqual([
      { op: 'set', path: ['providers', 'local', 'modelOverrides', 'qwen', 'compat', 'chatTemplateKwargs'], value: {
        enable_thinking: true,
        reasoning_effort: 'custom',
        preserve_thinking: false,
      } },
    ])
  })

  it('updates a models[] entry without dropping custom mappings or sibling models', () => {
    const item = arrayItem({
      thinkingFormat: 'chat-template',
      supportsStore: true,
      chatTemplateKwargs: {
        custom_flag: 'keep',
        enable_thinking: false,
        reasoning_effort: 'custom',
        preserve_thinking: true,
      },
    })
    const sibling = { id: 'other', compat: { supportsStore: false } }
    const itemWithSnapshot = { ...item, modelsSnapshot: [item.raw, sibling] }
    const operations = opsForModelArrayCompat([itemWithSnapshot], itemWithSnapshot, { preserveThinking: 'unsupported' }, editable)
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({ op: 'set', path: ['providers', 'local', 'models'] })
    const models = (operations[0] as { value: Array<Record<string, unknown>> }).value
    expect(models[0]).toEqual({
      id: 'qwen',
      compat: {
        thinkingFormat: 'chat-template',
        supportsStore: true,
        chatTemplateKwargs: {
          custom_flag: 'keep',
          enable_thinking: false,
          reasoning_effort: 'custom',
          preserve_thinking: false,
        },
      },
    })
    expect(models[1]).toEqual(sibling)
  })

  it('copies the effective inherited kwargs before setting a model override', () => {
    const item = arrayItem({ thinkingFormat: 'chat-template' })
    const operations = opsForModelArrayCompat([item], item, { preserveThinking: 'supported' }, editable, {
      thinkingFormat: 'chat-template',
      chatTemplateKwargs: { enable_thinking: false, reasoning_effort: 'provider-custom', custom_flag: 'keep' },
    })
    const models = (operations[0] as { value: Array<Record<string, unknown>> }).value
    expect(models[0]).toEqual({
      id: 'qwen',
      compat: {
        thinkingFormat: 'chat-template',
        chatTemplateKwargs: {
          enable_thinking: false,
          reasoning_effort: 'provider-custom',
          custom_flag: 'keep',
          preserve_thinking: true,
        },
      },
    })
  })

  it('Auto deletes only preserve_thinking and projects the resulting atomic mask truthfully', () => {
    const item = arrayItem({
      thinkingFormat: 'chat-template',
      chatTemplateKwargs: {
        enable_thinking: enableByEffort,
        reasoning_effort: effortByLevel,
        preserve_thinking: false,
      },
    })
    const operations = opsForModelArrayCompat([item], item, { preserveThinking: 'auto' }, editable)
    const models = (operations[0] as { value: Array<Record<string, unknown>> }).value
    expect(models[0]).toEqual({
      id: 'qwen',
      compat: {
        thinkingFormat: 'chat-template',
        chatTemplateKwargs: { enable_thinking: enableByEffort, reasoning_effort: effortByLevel },
      },
    })
    const modelCompat = (models[0] as { compat: Record<string, unknown> }).compat
    expect(resolveGatewayCompat({
      provider: 'local',
      modelCompat,
      providerCompat: { thinkingFormat: 'chat-template', chatTemplateKwargs: { preserve_thinking: true } },
    }).preserveThinking).toEqual({ value: undefined, source: 'model' })
  })
})
