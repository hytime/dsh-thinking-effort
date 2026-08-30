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
import { inventoryFrom } from '../src/client/model-inventory.js'
import { mergeModelUpdate, setOps } from '../src/client/model-ops.js'
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
import type { InventoryItem, Translation } from '../src/client/types.js'

const translate: Translation = (key, params) => `${key}${params?.level ? `:${params.level}` : ''}`

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
    await expect(api?.describe()).resolves.toEqual({ ok: true, value: { namespaces: [] } })
    await expect(api?.mutate(NS, [], 4)).resolves.toEqual({ ok: true, value: { ns: NS } })
    expect(describe).toHaveBeenCalledWith()
    expect(mutate).toHaveBeenCalledWith(NS, [], 4)
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
