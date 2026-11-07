import React from 'react'
import { isOpenCodeSessionSectionId } from '../../compat/opencode-session.js'
import { isOpenCodeSessionNamespace } from '../model-header-ops.js'
import { LLM_PI_AI_NS } from '../../shared/constants.js'
import { isSettingsConflict } from '../../shared/conflict.js'
import { revisionOf } from '../types.js'
import type {
  ConfigFormFace,
  SettingsApi,
  SettingsNamespace,
  SettingsOp,
  Translation,
} from '../types.js'

/**
 * One save the panel can perform.
 *
 * The `rebuildOps` contract is the load-bearing part, and it differs by op
 * shape:
 *
 * - A LEAF op — `['providers', route, 'compat', field]`, an `opencodeSession`
 *   model flag, `subagentEffort` — sets exactly one path, so it lands on
 *   whatever the document now holds. `() => ops` is correct.
 * - A CONTAINER op carries a whole `models` array or `modelOverrides` dict
 *   rebuilt from THIS panel's inventory. Replaying it unchanged would write
 *   that stale container over the document and drop a concurrent edit to a
 *   sibling model, or a model another writer added. These callers MUST
 *   rebuild from `fresh`.
 *
 * Omitting it makes a conflict report instead of retry, which is the safe
 * default: an unproven replay is worse than a visible refusal.
 */
export interface SaveRequest {
  readonly ns: string
  readonly revision: number
  readonly ops: readonly SettingsOp[]
  readonly rebuildOps?: (fresh: SettingsNamespace) => readonly SettingsOp[]
  readonly successMessage: string
  readonly onSuccess?: () => void
  readonly openCodeSessionSavedKey?: string
  /**
   * The write targets the plugin's own entry section, so its response refreshes
   * the subagent view instead of the `llm-pi-ai` inventory.
   */
  readonly entrySectionWrite?: boolean
}

/** What the hook reports back to the component that owns the state. */
export interface SaveOutcome {
  /** The descriptor an accepted write returned, when its transport reports one. */
  readonly accepted?: SettingsNamespace
  readonly acceptedRequest?: SaveRequest
  readonly busy: true | false
  readonly error: string | null
}

export interface SaveRunnerOptions {
  readonly settings: SettingsApi
  readonly t: Translation
  /** Point the editor at the newly stored state; called for an accepted write. */
  readonly onAccepted: (request: SaveRequest, value: SettingsNamespace) => void
  /** Re-read the whole panel; used when the transport carries no descriptor. */
  readonly reload: (notice: string) => void
  readonly setBusy: () => void
  readonly setError: (message: string) => void
}

/**
 * The write queue every save in the settings panel goes through.
 *
 * It is a hook rather than a plain helper because it closes over the live
 * `settings` service and the panel's own state setters, and because the form
 * lookup has to run per write — the service can activate after this plugin's
 * `apply`, since client entries are created concurrently.
 *
 * Two transports exist and they are NOT interchangeable. When the host
 * publishes a write-capable config form, the form owns a serialized queue, a
 * revision fence and a post-refusal re-read, so the panel hands the ops over
 * and reloads on success — the form's `mutate` answers a bare boolean and
 * carries no descriptor. Otherwise the panel writes through
 * `settings.mutate` itself and projects the returned descriptor.
 */
export function useSaveQueue({ settings, t, onAccepted, reload, setBusy, setError }: SaveRunnerOptions): (request: SaveRequest) => void {
  /**
   * Re-read one section as the document now stands, so a write refused as stale
   * can be retried against it.
   *
   * `undefined` means the section could not be re-read; the caller then reports
   * the original conflict rather than writing without a revision, because a
   * write that cannot establish the current state has no business bypassing the
   * check that exists to protect it.
   */
  const latestSection = (target: string): Promise<SettingsNamespace | undefined> =>
    settings.describe().then((response) => {
      if (!response.ok) return undefined
      return response.value.namespaces.find((entry) => entry.ns === target)
    }).catch(() => undefined)

  /**
   * The official write queue for one section, when this host publishes one.
   *
   * Only a WRITE-CAPABLE form is served. An absent revision would make the host
   * read the write as unconditional, and a memory-mode form (off-loopback)
   * answers every mutation with `false` — in both cases the hand-rolled
   * transport is the better answer, so those forms are ignored rather than
   * allowed to swallow a save.
   */
  const formForWrite = (target: string): ConfigFormFace | undefined => {
    const form = settings.formFor?.(target)
    if (form === undefined) return undefined
    const snapshot = form.getSnapshot()
    return snapshot.writable === true && typeof snapshot.revision === 'number' ? form : undefined
  }

  return React.useCallback((request: SaveRequest): void => {
    const { ns, revision, ops, rebuildOps, successMessage, onSuccess, openCodeSessionSavedKey, entrySectionWrite } = request
    // The OpenCode-specific copy belongs to the header toggle, whose section id
    // happens to equal the entry id under the 0.1.7 model. A failed subagent
    // save targets that same section (`entrySectionWrite`), so the discriminator
    // is the write kind, not the id: keying on the id alone would report a
    // subagent failure as an OpenCode session failure.
    const writeError = (message: string): string => isOpenCodeSessionSectionId(ns) && entrySectionWrite !== true
      ? t('opencodeSessionSaveFailed', { message })
      : t('writeError', { message })
    setBusy()

    const succeed = (value: SettingsNamespace): void => {
      if (!value || typeof value !== 'object') {
        setError(t('saveMissingNamespace'))
        return
      }
      const savedKey = openCodeSessionSavedKey
      if (ns !== LLM_PI_AI_NS && entrySectionWrite !== true && (savedKey === undefined || !isOpenCodeSessionNamespace(value))) {
        setError(t('saveMissingNamespace'))
        return
      }
      onSuccess?.()
      onAccepted(request, value)
    }

    // A refusal and a thrown transport error are kept apart because the two
    // transports report differently: the modern Remote answers `ok: false`
    // while the legacy bridge rejects, and only the refusal carries a message
    // the caller is expected to render verbatim.
    type Outcome = { readonly ok: true; readonly value: SettingsNamespace }
      | { readonly ok: false; readonly message: string; readonly conflict: boolean; readonly threw: boolean }
    const writeOnce = async (writeOps: readonly SettingsOp[], expectedRevision: number): Promise<Outcome> => {
      try {
        const response = await settings.mutate(ns, writeOps, expectedRevision)
        return response.ok
          ? { ok: true, value: response.value }
          : { ok: false, message: response.error.message, conflict: isSettingsConflict(response.error), threw: false }
      } catch (error: unknown) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
          conflict: isSettingsConflict(error),
          threw: true,
        }
      }
    }

    const run = async (): Promise<void> => {
      const form = formForWrite(ns)
      if (form !== undefined) {
        // The form owns a serialized write queue, a revision fence and a
        // post-refusal re-read, so the panel no longer fences the FIRST attempt
        // itself against its mount-time revision. That fence does not cover the
        // rebuild-and-retry below, which still runs. The first attempt omits
        // `expectedRevision` on purpose: the form fences against the revision
        // IT tracks, not the panel's mount-time copy, which is exactly the
        // stale value the fence exists to supersede.
        // Its `mutate` answers with a bare boolean and carries no descriptor, so
        // success refreshes through `reload` — the same projection the legacy
        // path reaches through `succeed` — rather than projecting an empty
        // value, which would blank the provider and model views.
        if (await form.mutate(ops)) { onSuccess?.(); reload(successMessage); return }
        // A refusal is retried ONCE, and only for a caller that supplied
        // `rebuildOps`: replaying a stale container array would succeed while
        // discarding the concurrent change that caused the refusal. The rebuild
        // still needs a FULL descriptor (`value.providers` for the inventory,
        // `schema` for the editable compat fields), neither of which the form
        // snapshot carries, so the re-read goes through `describe()`.
        if (rebuildOps !== undefined) {
          const fresh = await latestSection(ns)
          if (fresh !== undefined) {
            const rebuilt = rebuildOps(fresh)
            if (rebuilt.length > 0 && await form.mutate(rebuilt, revisionOf(fresh))) {
              onSuccess?.(); reload(successMessage); return
            }
          }
        }
        // `mutate` returns only a boolean, so there is no host message to
        // render; the honest report is the generic write failure.
        setError(writeError(t('writeFailed')))
        return
      }
      let outcome = await writeOnce(ops, revision)
      // The panel holds the revision it read at mount, so any write to the same
      // section meanwhile — another window, the Host's own default-levels fill,
      // a model switch — fences every later save forever. Re-read the section
      // and retry ONCE against it.
      //
      // The retry only runs for a caller that supplied `rebuildOps`, and for a
      // container-shaped write that callback rebuilds the array from the FRESH
      // inventory: replaying the panel's stale array would succeed while
      // silently discarding the very concurrent change that caused the
      // conflict. A second conflict is reported rather than retried again, so a
      // persistently losing writer cannot spin, and a rebuild that yields no
      // ops (every target model is gone) reports the original conflict instead
      // of claiming success.
      if (!outcome.ok && outcome.conflict && rebuildOps !== undefined) {
        const fresh = await latestSection(ns)
        if (fresh !== undefined) {
          const freshRevision = revisionOf(fresh)
          if (freshRevision !== revision) {
            const rebuilt = rebuildOps(fresh)
            if (rebuilt.length > 0) outcome = await writeOnce(rebuilt, freshRevision)
          }
        }
      }
      if (outcome.ok) { succeed(outcome.value); return }
      const message = outcome.message
      setError(outcome.threw && message.length === 0 ? t('writeFailed') : writeError(message))
    }
    // `succeed` renders the accepted response and is not expected to throw, but
    // it used to run inside the transport's `.catch`, so a throw there surfaced
    // as a reported write failure. Keeping that net means an unexpected error
    // leaves the button usable and visible instead of only reaching the console.
    run().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setError(message.length > 0 ? writeError(message) : t('writeFailed'))
    })
  }, [settings, t, onAccepted, reload, setBusy, setError])
}
