import { isUnknownRecord } from '../shared/guards.js'
import type { ModelDirectoryState, ModelSelection, SliderDirectory } from '../client/thinking-slider/slider.js'
import type { ModelDirectoriesSeam } from './model-directory.js'

export interface SelectionProjectionFace {
  getSnapshot(): unknown
  subscribe(callback: () => void): () => void
}

export interface SelectionDirectoryFace {
  readonly directory: SliderDirectory
  load(): void
  select(selection: ModelSelection): Promise<boolean>
  reset(): void
  dispose(): void
}

function selectionOf(value: unknown): ModelSelection | null {
  if (!isUnknownRecord(value) || typeof value.provider !== 'string' || typeof value.model !== 'string') return null
  if (value.provider.length === 0 || value.model.length === 0) return null
  if (value.reasoningEffort !== undefined && typeof value.reasoningEffort !== 'string') return null
  return value as unknown as ModelSelection
}

function nextOf(projected: SelectionProjectionFace): ModelSelection | null {
  const value = projected.getSnapshot()
  return isUnknownRecord(value) ? selectionOf(value.next) : null
}

function sameSelection(left: ModelSelection | null, right: ModelSelection | null): boolean {
  return left === right || left !== null && right !== null && left.provider === right.provider
    && left.model === right.model && left.reasoningEffort === right.reasoningEffort
}

/** Preserve a confirmed session selection across missing projection frames. */
export function createSelectionDirectory(
  instance: ReturnType<ModelDirectoriesSeam['directoryFor']>,
  projected: SelectionProjectionFace,
): SelectionDirectoryFace {
  let confirmed = nextOf(projected)
  let observed = confirmed
  let ignoredPending: ModelSelection | null = null
  let projectionRevision = 0
  let generation = 0
  let disposed = false
  let active: ModelSelection | null = null
  let selectionError: string | null = null
  const listeners = new Set<() => void>()

  function read(): ModelDirectoryState {
    const raw = instance.store.getSnapshot()
    const rawPending = raw.pending ?? null
    const pending = active ?? (sameSelection(rawPending, ignoredPending) ? null : rawPending)
    const current = pending ?? confirmed ?? raw.current
    const routable = current === null || raw.routable === null ? null
      : raw.groups.some(group => group.id === current.provider && group.models.some(model => model.id === current.model))
    const status = selectionError === null ? raw.status : 'error'
    const error = selectionError ?? raw.error
    return sameSelection(current, raw.current) && sameSelection(pending, raw.pending ?? null)
      && routable === raw.routable && status === raw.status && error === raw.error
      ? raw : { ...raw, current, pending, routable, status, error }
  }

  let snapshot = read()
  function publish(): void {
    if (disposed) return
    snapshot = read()
    for (const listener of listeners) listener()
  }
  const unsubscribeDirectory = instance.store.subscribe(() => {
    const pending = instance.store.getSnapshot().pending ?? null
    if (!sameSelection(pending, ignoredPending)) {
      ignoredPending = null
      if (pending !== null) selectionError = null
    }
    // A rejected transport leaves upstream stuck on its own failed operation
    // (status stays `selecting`, pending stays set). Once the host publishes a
    // settled status again, the failure is no longer current, so the overlay
    // must stop reporting it.
    if (selectionError !== null && pending === null
      && instance.store.getSnapshot().status !== 'selecting') {
      selectionError = null
    }
    if (active !== null && pending !== null && !sameSelection(active, pending)) {
      ++generation
      active = null
    }
    publish()
  })
  const unsubscribeProjection = projected.subscribe(() => {
    const next = nextOf(projected)
    const pending = instance.store.getSnapshot().pending ?? null
    const confirmsPending = pending !== null && sameSelection(next, pending) && !sameSelection(next, confirmed)
    if (next !== null && (!sameSelection(next, observed) || confirmsPending)) {
      observed = next
      confirmed = next
      selectionError = null
      projectionRevision++
      if (pending !== null && !sameSelection(pending, next)) ignoredPending = pending
      if (active !== null && !sameSelection(active, next)) {
        ++generation
        active = null
      }
    }
    publish()
  })

  return {
    directory: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        if (disposed) return () => {}
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    load: () => { if (!disposed) void instance.load().catch(() => {}) },
    select: async (selection) => {
      if (disposed) return false
      const operation = ++generation
      const revision = projectionRevision
      active = selection
      selectionError = null
      ignoredPending = null
      publish()
      let accepted = false
      let rejection: string | null = null
      try {
        const result = await instance.select(selection)
        accepted = !isUnknownRecord(result) || result.ok !== false
      } catch (error) {
        rejection = error instanceof Error ? error.message : String(error)
      }
      if (disposed || operation !== generation) return false
      if (!accepted) {
        const pending = instance.store.getSnapshot().pending ?? null
        if (sameSelection(pending, selection)) ignoredPending = pending
        selectionError = rejection
      }
      if (accepted && revision === projectionRevision) {
        confirmed = selection
      }
      active = null
      publish()
      return accepted
    },
    reset: () => {
      if (disposed) return
      ++generation
      confirmed = null
      observed = null
      ignoredPending = null
      selectionError = null
      active = null
      publish()
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      ++generation
      unsubscribeDirectory()
      unsubscribeProjection()
      listeners.clear()
    },
  }
}
