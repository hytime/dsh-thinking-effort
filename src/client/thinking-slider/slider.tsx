/**
 * Composer model seat (`conversation.input.model`) — Task 2: two-tier
 * directory-backed region. The model-name row derives from the session's
 * `current` selection (handling null/loading/error states); the effort scale
 * renders exactly the levels the host catalog declares for the current model
 * (`reasoning.efforts`). Interaction (range submit through `select`) lands in
 * Task 3, so this file keeps the seat presentational and state-driven.
 */
import { createElement, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { Translation } from '../types.js'
import css from './slider.module.css'

/**
 * Local minimal mirror of the official catalog shapes
 * (deepseek-harness packages/api/session-controller/src/types.ts:104-123).
 * The official type package is intentionally not a dependency; runtime values
 * reach this component only through the single seam assertion in `index.ts`.
 */
export interface ModelReasoningEffort {
  readonly id: string
  readonly name: string
  readonly description?: string
}

export interface ModelReasoning {
  readonly efforts: readonly ModelReasoningEffort[]
  readonly defaultEffort?: string
}

export interface ModelCatalogModel {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly reasoning?: ModelReasoning
}

export interface ModelProviderGroup {
  readonly id: string
  readonly name: string
  readonly models: readonly ModelCatalogModel[]
}

export interface ModelSelection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

export type ModelDirectoryStatus = 'idle' | 'loading' | 'ready' | 'selecting' | 'error'

export interface ModelCatalogFailure {
  readonly id: string
  readonly name: string
  readonly message: string
}

export interface ModelDirectoryState {
  readonly current: ModelSelection | null
  readonly routable: boolean | null
  readonly groups: readonly ModelProviderGroup[]
  readonly failures: readonly ModelCatalogFailure[]
  readonly status: ModelDirectoryStatus
  readonly error: string | null
}

/** Read face of the shared per-session directory store (uSES-compatible). */
export interface SliderDirectory {
  getSnapshot(): ModelDirectoryState
  subscribe(fn: () => void): () => void
}

/**
 * Seat component props: the injected directory store plus the optional
 * load/select verbs (`locked`/interaction wire up in Task 3). `t` is bound to
 * LOCALE_NS by the slot renderer through the registration's `locale` field.
 */
export interface SliderProps {
  readonly directory: SliderDirectory
  readonly load?: () => void
  readonly select?: (selection: ModelSelection) => Promise<boolean>
  readonly locked?: boolean
  readonly t: Translation
}

const EMPTY_EFFORTS: readonly ModelReasoningEffort[] = []

/** Resolve the current selection back to its catalog model entry. */
function currentModelOf(state: ModelDirectoryState): ModelCatalogModel | undefined {
  if (state.current === null) return undefined
  for (const group of state.groups) {
    for (const model of group.models) {
      if (group.id === state.current.provider && model.id === state.current.model) return model
    }
  }
  return undefined
}

/**
 * Render the composer model seat: the model-name row (from `current`) above a
 * scale of exactly the configured reasoning efforts, or the matching copy for
 * loading / no-selection / empty-efforts / error states.
 */
export function Slider({ directory, t }: SliderProps): ReactNode {
  const state = useSyncExternalStore(
    (fn: () => void) => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )
  const current = state.current
  const model = currentModelOf(state)
  const modelLabel = current === null
    ? state.status === 'loading' ? t('seatModelLoading') : t('seatNoModel')
    : model?.name ?? `${current.provider}/${current.model}`
  const efforts = model?.reasoning?.efforts ?? EMPTY_EFFORTS

  return createElement(
    'div',
    { className: css.root },
    createElement('div', { className: css.modelRow }, modelLabel),
    state.status === 'error' && state.error !== null
      ? createElement('div', { className: css.error }, t('seatError', { message: state.error }))
      : efforts.length === 0
        ? createElement('div', { className: css.empty }, t('seatNoEfforts'))
        : createElement(
          'div',
          { className: css.scale },
          ...efforts.map((effort) => createElement('span', { className: css.tick, key: effort.id }, effort.name)),
        ),
  )
}
