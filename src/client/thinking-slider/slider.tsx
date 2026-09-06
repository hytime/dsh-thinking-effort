/**
 * Composer model seat (`conversation.input.model`) renders the host-provided
 * model directory and submits discrete reasoning-effort changes through the
 * injected session-selection callback.
 */
import {
  createElement, useEffect, useRef, useState, useSyncExternalStore,
} from 'react'
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react'
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

/** Seat component props provided by the optional model-directory service. */
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
 * Render the composer model seat. The expanded panel presents reasoning before
 * the model row; the compact trigger preserves both model and effort labels.
 */
export function Slider({ directory, select, locked = false, t }: SliderProps): ReactNode {
  const state = useSyncExternalStore(
    (fn: () => void) => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )
  const [open, setOpen] = useState(true)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const current = state.current
  const model = currentModelOf(state)
  const modelLabel = current === null
    ? state.status === 'loading' ? t('seatModelLoading') : t('seatNoModel')
    : model?.name ?? `${current.provider}/${current.model}`
  const reasoning = model?.reasoning
  const efforts = reasoning?.efforts ?? EMPTY_EFFORTS
  const effectiveEffort = current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortIndex = efforts.findIndex(({ id }) => id === effectiveEffort)
  const rangeValue = effortIndex < 0 ? 0 : effortIndex
  const rangeEffort = efforts[rangeValue]
  const currentEffortLabel = rangeEffort?.name ?? t('seatNoEfforts')
  const hasDirectoryError = state.status === 'error' && state.error !== null
  const busy = locked || state.status === 'selecting' || select === undefined

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  const closeWithFocus = (): void => {
    setOpen(false)
    queueMicrotask(() => { triggerRef.current?.focus() })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    closeWithFocus()
  }

  const submit = (selection: ModelSelection): void => {
    if (locked || select === undefined) return
    const pending = select(selection)
    void pending.then(() => {}, () => {})
  }

  const onRangeChange = (event: ChangeEvent<HTMLInputElement>): void => {
    if (current === null) return
    const effort = efforts[Number(event.currentTarget.value)]
    if (effort === undefined) return
    submit({ provider: current.provider, model: current.model, reasoningEffort: effort.id })
  }

  const modelTrigger = (compact: boolean) => createElement(
    'button',
    {
      className: compact ? css.chip : css.modelRow,
      'data-seat-trigger': 'true',
      ref: triggerRef,
      type: 'button',
      disabled: locked,
      'aria-expanded': open,
      'aria-label': compact
        ? `${modelLabel}: ${currentEffortLabel}`
        : `${t('seatModelLabel')}: ${modelLabel}`,
      onClick: () => { setOpen(value => !value) },
    },
    compact
      ? [
          createElement('span', { className: css.chipModel, key: 'model', title: modelLabel }, modelLabel),
          createElement('span', { className: css.chipEffort, key: 'effort' }, currentEffortLabel),
          createElement('span', { className: css.chevron, key: 'chevron', 'aria-hidden': true }),
        ]
      : [
          createElement('span', { className: css.modelLabel, key: 'label' }, t('seatModelLabel')),
          createElement('span', { className: css.modelName, key: 'model', title: modelLabel }, modelLabel),
          createElement('span', { className: css.chevron, key: 'chevron', 'aria-hidden': true }),
        ],
  )

  const content = efforts.length === 0
    ? hasDirectoryError
      ? createElement('div', { className: css.error }, t('seatError', { message: state.error }))
      : createElement('div', { className: css.empty }, t('seatNoEfforts'))
    : [
        createElement('input', {
          className: css.range,
          'data-seat-input': 'true',
          type: 'range',
          min: 0,
          max: efforts.length - 1,
          step: 1,
          value: rangeValue,
          disabled: busy,
          'aria-label': t('seatSliderLabel'),
          'aria-valuetext': currentEffortLabel,
          onChange: onRangeChange,
          key: 'range',
        }),
        createElement(
          'div',
          { className: css.scale, 'data-seat-scale': 'true', key: 'scale' },
          ...efforts.map((effort, index) => createElement(
            'span',
            { className: index === rangeValue ? `${css.tick} ${css.activeTick}` : css.tick, key: effort.id },
            effort.name,
          )),
        ),
        reasoning?.defaultEffort === undefined && current !== null
          ? createElement('button', {
            className: css.followDefault,
            'data-seat-default': 'true',
            type: 'button',
            disabled: busy,
            onClick: () => { submit({ provider: current.provider, model: current.model }) },
            key: 'default',
          }, t('seatFollowDefault'))
          : null,
        hasDirectoryError
          ? createElement('div', { className: css.error, 'data-seat-select-error': 'true', key: 'error' }, t('seatErrorAction', { message: state.error }))
          : null,
      ]

  const panel = open
    ? createElement(
      'div',
      { className: css.panel, 'data-seat-panel': 'true' },
      createElement(
        'div',
        { className: css.reasoning, 'data-seat-reasoning': 'true' },
        createElement('span', { className: css.reasoningLabel }, t('seatReasoningLabel')),
        createElement('span', { className: css.currentEffort }, currentEffortLabel),
      ),
      content,
      modelTrigger(false),
    )
    : modelTrigger(true)

  return createElement(
    'div',
    { className: css.root, ref: rootRef, onKeyDown, 'data-seat-root': 'true' },
    panel,
  )
}
