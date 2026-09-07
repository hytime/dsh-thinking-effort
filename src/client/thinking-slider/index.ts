/**
 * Thinking-effort composer model seat (`conversation.input.model`): registers
 * the seat over the optional shared model directory. The directory service is
 * read from the application context at apply time — when the official
 * ui-model-selection plugin is absent the seat is skipped so the Settings page
 * keeps working. The injected face is exactly the JSON-safe directory
 * store/verbs (`{ directory, load, select }`); the seat renders only through
 * those props.
 *
 * DSH version adaptation (see version-research.md): the seat's closure calls
 * `directoryFor()`, whose controller internally reaches the session remote
 * face. That face is `remote.session` from DSH `0.1.2-alpha.1+` (npm
 * `0.1.2-alpha.2`+) but `connection.api.sessions` on `0.1.0-rc.7` and
 * `0.1.0-rc.8` — a version where `remote.session` does not exist as a service.
 * Because Cordis silently parks a fiber whose `inject` lists a missing service
 * (never calling `apply`), the seat must declare `remote.session` only when the
 * runtime exposes it, decided here by a shape probe via `context.get` (the
 * inject-free read face).
 */
import { createElement } from 'react'
import { LOCALE_NS } from '../constants.js'
import { asModelDirectories, modelDirectoryCompatibility, type ModelDirectoriesSeam } from '../../compat/model-directory.js'
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
    load: () => { void instance.load().catch(() => {}) },
    select: (selection) => instance.select(selection).then(() => true, () => false),
  }
}

/**
 * Whether the runtime session remote face is the modern `remote.session`
 * service (DSH 0.1.2-alpha.1+/npm alpha.2+). Detected by shape probe through
 * the inject-free `context.get` read face; older versions (`0.1.0-rc.7` /
 * `0.1.0-rc.8`) carry no such service and must NOT list it in `inject`.
 * @param context - client root context.
 */
export function hasSessionRemote(context: ClientContext): boolean {
  const remote = context.get('remote.session')
  if (remote === null || typeof remote !== 'object') return false
  const face = remote as { modelCatalog?: unknown }
  return typeof face.modelCatalog === 'function'
}

/**
 * Register the composer model seat over a Cordis-style client context. The
 * optional `modelDirectories` service is a declared `inject` dependency, so the
 * seat registers only when the official ui-model-selection service is live; it
 * is skipped when that service is absent. The `inject` list includes
 * `remote.session` only on runtimes that expose it (modern DSH); older
 * runtimes register with the base list, which is enough because the directory
 * controller owns its own `connection` face there.
 * @param context - client root context (slots + locale + optional model service).
 */
export function apply(context: ClientContext): void {
  const translate = context.get('locale')
    ? (context.get('locale') as ClientLocale).bind(LOCALE_NS)
    : (key: string) => key
  let registered = false

  const registerWhenReady = (): void => {
    if (registered) return
    const modelDirectories = context.get('modelDirectories')
    if (!asModelDirectories(modelDirectories)) return

    const compatibility = modelDirectoryCompatibility(context)
    registered = true
    context.plugin({
      name: 'dsh-thinking-effort:composer-seat',
      inject: compatibility.inject,
      apply: (scope: ClientContext): void => {
        const scopedSlots = (scope as ClientContext & { slots?: ClientSlots }).slots
        if (scopedSlots === undefined) return
        const directories = asModelDirectories(scope.get('modelDirectories'))
        if (directories === undefined) return

        // Match the official ui-model-selection composition: slots.inject owns
        // the registration effect for the declaring plugin fiber and disposes
        // it when the fiber is unloaded or its slot declaration collapses.
        scopedSlots.inject(SEAT_NAME, () => scopedSlots.register(
          {
            name: SEAT_NAME,
            priority: SEAT_PRIORITY,
            locale: LOCALE_NS,
            inject: (sessionId: string) => seatFace(directories, sessionId),
          },
          (props: ComposerSeatInjected & { readonly locked?: boolean; readonly t: Translation }) => createElement(Slider, {
            directory: props.directory,
            load: props.load,
            select: props.select,
            locked: props.locked,
            t: props.t ?? translate,
          }),
        ))
      },
    })
  }

  // The official resolver is itself a plugin with service dependencies. It may
  // appear after this package's apply; probe now and retry on service updates.
  registerWhenReady()
  context.on('internal/service', (serviceName) => {
    if (serviceName === 'modelDirectories' || serviceName === 'remote.session') registerWhenReady()
  })
}
