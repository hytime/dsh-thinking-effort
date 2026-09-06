/**
 * Thinking-effort composer model seat (`conversation.input.model`), Task 2:
 * registers the seat over the optional shared model directory. The directory
 * service is read from the application context at apply time — when the
 * official ui-model-selection plugin is absent the seat is skipped so the
 * settings page keeps working. The injected face is exactly the JSON-safe
 * directory store/verbs (`{ directory, load, select }`); the seat renders
 * only through those props (Task 3 wires the interaction).
 */
import { createElement } from 'react'
import { LOCALE_NS } from '../constants.js'
import type { ClientContext, ClientLocale, ClientSlots, Translation } from '../types.js'
import { Slider } from './slider.js'
import type { ModelDirectoryState, ModelSelection } from './slider.js'

export { Slider } from './slider.js'
export type {
  ModelCatalogFailure,
  ModelCatalogModel,
  ModelDirectoryState,
  ModelProviderGroup,
  ModelReasoning,
  ModelReasoningEffort,
  ModelSelection,
  SliderDirectory,
  SliderProps,
} from './slider.js'

/** Target slot key of the composer model seat. */
export const SEAT_NAME = 'conversation.input.model'
/** Shadowing priority: the placeholder yields to any real occupant. */
export const SEAT_PRIORITY = -10

/**
 * Minimal structural face of the optional `modelDirectories` service. The
 * runtime value is the official ModelDirectoryResolver (ui-model-selection);
 * this local shape is the single seam where the runtime value is asserted,
 * so the consumer stays `as`-free afterwards.
 */
export interface ModelDirectoriesSeam {
  directoryFor(sessionId: string): {
    readonly store: Readonly<{ getSnapshot(): ModelDirectoryState; subscribe(fn: () => void): () => void }>
    load(): Promise<unknown>
    select(selection: ModelSelection): Promise<unknown>
  }
}

/** Signature-assert a runtime service value at the single seam site. */
export function asModelDirectories(value: unknown): ModelDirectoriesSeam | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const service = value as { directoryFor?: unknown }
  return typeof service.directoryFor === 'function' ? value as ModelDirectoriesSeam : undefined
}

/** The seat's injected business face ({@link SliderProps} minus `t`). */
export interface ComposerSeatInjected {
  readonly directory: Readonly<{ getSnapshot(): ModelDirectoryState; subscribe(fn: () => void): () => void }>
  readonly load: () => void
  readonly select: (selection: ModelSelection) => Promise<boolean>
}

/** Build one session's injected face from the shared directory service. */
function seatFace(
  modelDirectories: ModelDirectoriesSeam,
  sessionId: string,
): ComposerSeatInjected {
  const instance = modelDirectories.directoryFor(sessionId)
  return {
    // The component reads through useSyncExternalStore, so the injected
    // `directory` must be the STORE itself (subscribe/getSnapshot), not the
    // owning controller.
    directory: instance.store,
    load: () => { void instance.load() },
    select: (selection) => instance.select(selection).then(() => true, () => false),
  }
}

/**
 * Register the composer model seat over a Cordis-style client context.
 * The optional `modelDirectories` service is asserted at the single seam;
 * when it is absent the registration is skipped entirely.
 * @param context - client root context (slots + locale + optional model service).
 */
export function apply(context: ClientContext): void {
  const slots = context.get('slots') as ClientSlots | undefined
  if (slots === undefined) return
  const locale = context.get('locale') as ClientLocale
  const translate = locale.bind(LOCALE_NS)
  const modelDirectories = asModelDirectories(context.get('modelDirectories'))
  if (modelDirectories === undefined) return

  // I1 (task-1 review): the registration lives inside a `context.effect` so a
  // plugin re-apply (same key + same priority) disposes the previous
  // registration instead of tripping the official same-cell throw
  // (ui-slots/src/index.ts:826). The slots.inject disposer is the cleanup.
  context.effect(() => slots.inject(SEAT_NAME, () => slots.register(
    {
      name: SEAT_NAME,
      priority: SEAT_PRIORITY,
      locale: LOCALE_NS,
      inject: (sessionId: string) => seatFace(modelDirectories, sessionId),
    },
    (props: ComposerSeatInjected & { readonly locked?: boolean; readonly t: Translation }) => createElement(Slider, {
      directory: props.directory,
      load: props.load,
      select: props.select,
      locked: props.locked,
      t: props.t ?? translate,
    }),
  )), 'dsh-thinking-effort: composer model seat')
}
