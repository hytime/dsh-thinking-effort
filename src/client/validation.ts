import { ALL_LEVELS, CONTEXT_1M, CONTEXT_MAX, CONTEXT_MIN, INPUT_MODALITIES, LEVEL_LABEL_KEYS } from './constants.js'
import type { ContextDraft, InputDraft, InputModality, InventoryItem, ReasoningDraft, ReasoningEfforts, Translation } from './types.js'

export function draftFrom(levels: ReasoningEfforts | null | undefined): ReasoningDraft {
  const draft: ReasoningDraft = {}
  for (const level of ALL_LEVELS) {
    const value = levels?.[level]
    const wire = value === undefined ? '' : value === null ? '' : String(value)
    draft[level] = { on: wire !== '' || (level === 'off' && levels?.off === null), wire }
  }
  return draft
}

export function buildLevels(draft: ReasoningDraft): ReasoningEfforts {
  const output: ReasoningEfforts = {}
  for (const level of ALL_LEVELS) {
    const cell = draft[level]
    if (!cell?.on) continue
    output[level] = level === 'off' ? (cell.wire.trim() === '' ? null : cell.wire.trim()) : cell.wire.trim()
  }
  return output
}

export function contextDraftFrom(item: Pick<InventoryItem, 'contextWindow'>): ContextDraft {
  const contextWindow = Number.isInteger(item.contextWindow) ? item.contextWindow : undefined
  const value = contextWindow === undefined ? '' : String(contextWindow)
  return {
    value,
    oneMillion: contextWindow === CONTEXT_1M,
    previousValue: contextWindow === CONTEXT_1M ? '' : value,
    touched: false,
  }
}

export function inputDraftFrom(item: Pick<InventoryItem, 'input'>): InputDraft {
  const declared = Array.isArray(item.input) ? item.input : []
  const effective: readonly InputModality[] = declared.length > 0 ? declared : ['text']
  return { text: effective.includes('text'), image: effective.includes('image'), touched: false }
}

export function buildInput(draft: Pick<InputDraft, 'text' | 'image'> | undefined, translate: Translation): { value?: readonly ('text' | 'image')[]; error?: string } {
  if (!draft) return { value: undefined }
  const value = INPUT_MODALITIES.filter((modality) => draft[modality] === true)
  return value.length === 0 ? { error: translate('inputCapabilityMinimum') } : { value }
}

export function validateContextWindow(
  draft: Pick<ContextDraft, 'value' | 'oneMillion'> | undefined,
  translate: Translation,
): { value?: number; error?: string } {
  if (!draft) return { value: undefined }
  if (draft.oneMillion) return { value: CONTEXT_1M }
  const raw = typeof draft.value === 'string' ? draft.value.trim() : ''
  if (raw === '') return { value: undefined }
  if (!/^\d+$/.test(raw)) return { error: translate('contextInteger') }
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < CONTEXT_MIN || value > CONTEXT_MAX) return { error: translate('contextRange') }
  return { value }
}

export function validateLevels(levels: ReasoningEfforts, translate: Translation): string | null {
  let hasThinking = false
  for (const [level, wire] of Object.entries(levels)) {
    if (level === 'off') continue
    hasThinking = true
    if (typeof wire !== 'string' || wire.length === 0) {
      return translate('levelNeedsValue', { level: translate(LEVEL_LABEL_KEYS[level as keyof typeof LEVEL_LABEL_KEYS] ?? level) })
    }
  }
  return hasThinking ? null : translate('atLeastThinking')
}

export { ALL_LEVELS, CONTEXT_1M, CONTEXT_MAX, CONTEXT_MIN }
