/**
 * Model-directory shapes shared by the compat layer and the Composer seat.
 *
 * These types live in `kit` rather than in the client package because
 * `src/compat/**` consumes them: the version adapter decides which directory
 * faces a host offers, and that decision must not depend on a UI package. The
 * dependency therefore points one way — client code imports `kit`, never the
 * reverse.
 *
 * The shapes are a local minimal mirror of the official catalog
 * (`deepseek-harness packages/api/session-controller/src/types.ts`). The
 * official type package is deliberately not a dependency; runtime values reach
 * the Composer seat only through its own seam assertion.
 */

/** One reasoning-effort option a model declares. */
export interface ModelReasoningEffort {
  readonly id: string
  readonly name: string
  readonly description?: string
}

/** The effort table of one model. */
export interface ModelReasoning {
  readonly efforts: readonly ModelReasoningEffort[]
  readonly defaultEffort?: string
}

/** One routable model inside a provider group. */
export interface ModelCatalogModel {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly reasoning?: ModelReasoning
}

/** One provider's worth of routable models. */
export interface ModelProviderGroup {
  readonly id: string
  readonly name: string
  readonly models: readonly ModelCatalogModel[]
}

/** The route a Composer seat selects. */
export interface ModelSelection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** The directory store's coarse state, as the seat renders it. */
export type ModelDirectoryStatus = 'idle' | 'loading' | 'ready' | 'selecting' | 'error'

/** One provider whose catalog could not be read. */
export interface ModelCatalogFailure {
  readonly id: string
  readonly name: string
  readonly message: string
}

/** The whole snapshot one Composer seat renders from. */
export interface ModelDirectoryState {
  readonly current: ModelSelection | null
  readonly routable: boolean | null
  readonly groups: readonly ModelProviderGroup[]
  readonly failures: readonly ModelCatalogFailure[]
  readonly status: ModelDirectoryStatus
  readonly error: string | null
  /**
   * The selection the host has accepted but not yet confirmed, present on the
   * official directory store. Optional because the plugin also runs against
   * directory builds that predate it, and absent there is not an error.
   */
  readonly pending?: ModelSelection | null
}

/** Read face of the shared per-session directory store (uSES-compatible). */
export interface SliderDirectory {
  getSnapshot(): ModelDirectoryState
  subscribe(fn: () => void): () => void
}
