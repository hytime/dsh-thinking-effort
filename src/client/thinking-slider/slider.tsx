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
 * Render the composer model seat: a model trigger and an initially expanded
 * discrete-effort panel. The host directory remains the authoritative state.
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
    void select(selection).then(() => {}, () => {})
  }

  const onRangeChange = (event: ChangeEvent<HTMLInputElement>): void => {
    if (current === null) return
    const effort = efforts[Number(event.currentTarget.value)]
    if (effort === undefined) return
    submit({ provider: current.provider, model: current.model, reasoningEffort: effort.id })
  }

  const hasDirectoryError = state.status === 'error' && state.error !== null
  const panel = !open
    ? null
    : efforts.length === 0
      ? hasDirectoryError
        ? createElement('div', { className: css.error, 'data-seat-panel': true }, t('seatError', { message: state.error }))
        : createElement('div', { className: css.empty, 'data-seat-panel': true }, t('seatNoEfforts'))
      : createElement(
        'div',
        { className: css.panel, 'data-seat-panel': true },
        createElement(
          'div',
          { className: css.scale, 'data-seat-scale': true },
          ...efforts.map((effort) => createElement('span', { className: css.tick, key: effort.id }, effort.name)),
        ),
        createElement('input', {
          className: css.range,
          'data-seat-input': true,
          type: 'range',
          min: 0,
          max: efforts.length - 1,
          step: 1,
          value: rangeValue,
          disabled: locked,
          'aria-label': t('seatSliderLabel'),
          'aria-valuetext': rangeEffort?.name ?? t('seatFollowDefault'),
          onChange: onRangeChange,
        }),
        reasoning?.defaultEffort === undefined && current !== null
          ? createElement('button', {
            className: css.followDefault,
            'data-seat-default': true,
            type: 'button',
            disabled: locked,
            onClick: () => { submit({ provider: current.provider, model: current.model }) },
          }, t('seatFollowDefault'))
          : null,
        hasDirectoryError
          ? createElement('div', { className: css.error, 'data-seat-select-error': true }, t('seatErrorAction', { message: state.error }))
          : null,
      )

  return createElement(
    'div',
    { className: css.root, ref: rootRef, onKeyDown, 'data-seat-root': true },
    createElement('button', {
      className: css.modelRow,
      'data-seat-trigger': true,
      ref: triggerRef,
      type: 'button',
      disabled: locked,
      'aria-expanded': open,
      onClick: () => { setOpen(value => !value) },
    }, modelLabel),
    panel,
  )
}
