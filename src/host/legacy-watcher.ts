import { AsyncResource } from 'node:async_hooks'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  LEGACY_FAILED_PREFIX,
  LEGACY_RESULT_DISMISSED,
  LEGACY_RESULT_NOTHING_PENDING,
  legacyDecisionOf,
  legacyMigrationOf,
  type LegacyCandidate,
} from '../compat/legacy-migration.js'
import { readSettingsSectionUser, settingsChangeEvents, settingsEntryId, settingsModelForRuntime } from '../compat/capabilities.js'
import { applyLegacyMigration, rollbackSnapshot } from './legacy-apply.js'
import { scanLegacyData, type LegacyScan } from './legacy-scan.js'
import { SETTINGS_NAMESPACE } from './settings.js'
import { PLUGIN_ENTRY_ID } from '../compat/settings-model.js'
import type { HostContext, SettingsPathOp } from './types.js'

const LOG_PREFIX = '[@hytime/dsh-thinking-effort]'

/**
 * Most scan/act passes one settings event may run before the chain stops
 * re-running itself. The migration's own writes raise the event it listens to,
 * so the budget is what keeps a hostile or confused host from spinning.
 */
const MAX_MIGRATION_PASSES = 5

/** The document reader and home a scan uses; injectable for tests. */
export interface LegacyMigrationFiles {
  readonly home: string
  readonly read: (path: string) => Promise<string>
}

function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args)
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/**
 * The launcher's `profileContext.home` — the DSH home this process actually
 * runs against — when this host exposes one.
 *
 * `profileContext` is NOT part of this plugin's declared `HostContext`: it is a
 * launcher-owned service, present on the releases this migration targets and
 * absent from older lines. Both reads are therefore defensive. `get` is tried
 * first because it is the one access that answers `undefined` for a service
 * nobody provided — a bare `ctx.profileContext` on a context that cannot
 * resolve it THROWS (cordis resolves service properties through `inject`), and
 * a sandboxed host façade denies property access to every service the plugin
 * did not declare. The property form is the fallback for a context object
 * without `get`, such as the test doubles that inject a home directly.
 */
function profileHome(ctx: unknown): string | undefined {
  const context = recordOf(ctx)
  if (context === undefined) return undefined
  let service: unknown
  const lookup = context.get
  if (typeof lookup === 'function') {
    try {
      service = lookup.call(ctx, 'profileContext')
    } catch {
      service = undefined
    }
  }
  if (service === undefined) {
    try {
      service = context.profileContext
    } catch {
      service = undefined
    }
  }
  const home = recordOf(service)?.home
  return typeof home === 'string' && home.trim().length > 0 ? home : undefined
}

/**
 * The documents a scan reads and the home they sit under.
 *
 * The home is resolved the way the harness resolves it — `profileContext.home`
 * (which the launcher derives from `resolveDshHome()`), then a non-empty
 * `$DSH_HOME`, then `~/.dsh` — so the scanner reads the SAME directory the
 * user's settings actually live in. `process.cwd()` is deliberately not a
 * candidate: the harness never runs from the home, so a scan that fell back to
 * it found nothing and the whole feature did nothing, silently.
 *
 * @param ctx - the plugin context, read for the launcher's profile home.
 * @returns the resolved home and the document reader.
 */
export function defaultFiles(ctx: unknown): LegacyMigrationFiles {
  const configured = process.env.DSH_HOME
  const home = profileHome(ctx)
    ?? (typeof configured === 'string' && configured.trim().length > 0 ? configured.trim() : undefined)
    ?? join(homedir(), '.dsh')
  return { home, read: (path: string) => readFile(path, 'utf8') }
}

/**
 * The legacy-data migration: scan the documents DSH's 0.1.7 rename stranded,
 * ask the user through the plugin's own settings section, and write back what
 * they accept.
 *
 * Only an `entry-config` host runs this. Under the namespace model the plugin's
 * own section IS the legacy `dsh-thinking-effort` namespace, so nothing is
 * stranded and a prompt would be noise.
 *
 * @param ctx - the plugin context.
 * @param files - overrides for the documents; tests inject a fake reader.
 */
export function installLegacyMigration(ctx: HostContext, files: LegacyMigrationFiles = defaultFiles(ctx)): void {
  const settings = ctx.settings
  if (settings === undefined) return
  if (settingsModelForRuntime({ settings }) !== 'entry-config') return

  const ns = settingsEntryId(ctx, PLUGIN_ENTRY_ID)

  ctx.effect(() => {
    /**
     * The context migration writes run in.
     *
     * 0.1.7 raises the change event from inside the write that caused it, while
     * the config editor still holds its `hmr.runExclusive` transaction open; a
     * listener that writes back is refused with "HMR transactions cannot be
     * nested", and so is anything it defers, because the transaction context
     * travels with `AsyncLocalStorage`. This resource is created while the
     * plugin is applied — outside that transaction — so entering it gives the
     * write a context the host accepts.
     */
    const scope = new AsyncResource('dsh-thinking-effort:legacy-migration')
    let alive = true
    let inFlight = false
    let queued = false
    let current: Promise<void> = Promise.resolve()

    /** Read the plugin's own user layer as published. */
    const ownUser = (): unknown => readSettingsSectionUser(settings, ns)

    /**
     * That layer when the host actually publishes it, or `undefined` while the
     * section has not materialized yet. The distinction matters: an absent layer
     * makes every path look unset, which is not a fact to act on.
     */
    const ownLayer = (user: unknown): Record<string, unknown> | undefined => (
      typeof user === 'object' && user !== null && !Array.isArray(user)
        ? user as Record<string, unknown>
        : undefined
    )

    /**
     * Run one unit of work in the apply-time context. EVERY write the migration
     * performs goes through here — the control-object writes below AND the
     * migration batch itself. `applyLegacyMigration` invokes its `mutate` before
     * its first `await`, so entering the scope around the call is what gives that
     * batch the context the host accepts; without it the batch is refused as a
     * nested transaction on 0.1.7 and `decision=migrate` could never land.
     */
    const inScope = <T,>(work: () => T): T => scope.runInAsyncScope(work)

    const write = (ops: readonly SettingsPathOp[]): Promise<void> => new Promise<void>((resolve, reject) => {
      inScope(() => {
        const mutate = settings.mutate
        if (typeof mutate !== 'function') {
          reject(new Error('settings service cannot address paths'))
          return
        }
        Promise.resolve(mutate.call(settings, ns, ops)).then(() => resolve(), reject)
      })
    })

    const set = (path: readonly string[], value: unknown): Promise<void> =>
      write([{ op: 'set', path: [...path], value }])

    /**
     * One current read of the legacy documents against the live sections.
     *
     * `own` is passed in rather than read here so that ONE pass decides "has my
     * section materialized yet?" from ONE snapshot. Reading it twice lets the
     * scan see an absent layer — every path then looks unset, so the whole set is
     * offered — while a later read sees the section published, and the pass arms
     * an offer computed from a state that no longer holds.
     */
    const scan = (own: unknown): Promise<LegacyScan> => scanLegacyData({
      home: files.home,
      read: files.read,
      ownUser: own,
      llmPiAiUser: readSettingsSectionUser(settings, SETTINGS_NAMESPACE),
    })

    /**
     * Write one complete control object. Every field is restated because a path
     * `set` replaces the value at that path wholesale; the ones a caller does
     * not care about are carried over from the published object so a write
     * never loses them.
     */
    const publish = (next: {
      readonly pending: boolean
      readonly candidates: readonly LegacyCandidate[]
      readonly signature: string
      readonly lastResult?: string
      readonly dismissedSignature?: string
      readonly scannedAt?: string
      readonly decidedAt?: string
    }): Promise<void> => set(['legacyMigration'], {
      pending: next.pending,
      candidates: next.candidates,
      signature: next.signature,
      dismissedSignature: next.dismissedSignature ?? legacyMigrationOf(ownUser())?.dismissedSignature ?? '',
      decision: '',
      lastResult: next.lastResult ?? '',
      scannedAt: next.scannedAt ?? legacyMigrationOf(ownUser())?.scannedAt ?? '',
      decidedAt: next.decidedAt ?? '',
    })

    /** Persist a fresh offer. */
    const arm = async (result: LegacyScan): Promise<void> => {
      await publish({
        pending: true,
        candidates: result.candidates,
        signature: result.signature,
        scannedAt: new Date().toISOString(),
      })
      log('legacy migration: offered', result.candidates.length, 'value(s)')
    }

    /**
     * Close the offer out with nothing migrated.
     *
     * `lastResult` is recorded only when the pass ran because the user asked for
     * a scan: a completed scan is a fact the card has to report, while the other
     * callers are reconciling an offer that was already declined or already
     * applied and must not put a result line on screen for a scan nobody asked
     * for. An omitted result clears any earlier one, which is what a fresh offer
     * needs.
     */
    const settleEmpty = async (result: LegacyScan, lastResult?: string): Promise<void> => {
      await publish({
        pending: false,
        candidates: [],
        signature: result.signature,
        scannedAt: new Date().toISOString(),
        lastResult,
      })
    }

    const dismiss = async (signature: string): Promise<void> => {
      await publish({
        pending: false,
        candidates: [],
        signature,
        dismissedSignature: signature,
        lastResult: LEGACY_RESULT_DISMISSED,
        decidedAt: new Date().toISOString(),
      })
    }

    const clearAfterApply = async (signature: string, candidates: readonly LegacyCandidate[], lastResult: string): Promise<void> => {
      const failed = lastResult.startsWith(LEGACY_FAILED_PREFIX)
      await publish({
        // A refusal keeps the offer up so the prompt can offer a retry; the
        // candidates are the freshly scanned ones, not whatever the section held.
        pending: failed,
        candidates: failed ? candidates : [],
        signature,
        lastResult,
        decidedAt: new Date().toISOString(),
      })
    }

    /** One pass: act on a decision if the user has made one, then reconcile the offer. */
    const pass = async (): Promise<void> => {
      // ONE read of the section for the whole pass: the state this pass reasons
      // about and the layer the scan diffs against must be the same snapshot.
      const own = ownUser()
      const before = legacyMigrationOf(own)
      const decision = legacyDecisionOf(own)

      if (decision === 'migrate') {
        // The scan runs again here and ITS candidates are what gets written. The
        // published list is a display: the section is user-writable and volatile,
        // so the host must not turn values it did not derive into path writes.
        // Re-scanning also settles whatever changed between prompt and click.
        const fresh = await scan(own)
        if (fresh.candidates.length === 0) {
          // Nothing survived the re-scan. Do NOT claim the values were applied:
          // the documents may simply have been unreadable this pass, and a
          // "migrated" record would close the prompt over a migration that never
          // happened. Retire the offer instead, which is recoverable.
          await settleEmpty(fresh)
          return
        }
        const lastResult = await inScope(() => applyLegacyMigration({
          settings,
          ns,
          candidates: fresh.candidates,
          // Built here, before the batch is sent, from the user layers alone:
          // this is the state the migration is about to extend.
          snapshot: () => rollbackSnapshot({
            pluginNs: ns,
            createdAt: new Date().toISOString(),
            sections: {
              [ns]: (readSettingsSectionUser(settings, ns) ?? {}) as Record<string, unknown>,
              [SETTINGS_NAMESPACE]: (readSettingsSectionUser(settings, SETTINGS_NAMESPACE) ?? {}) as Record<string, unknown>,
            },
          }),
          clear: async () => {},
        }))
        await clearAfterApply(fresh.signature, fresh.candidates, lastResult)
        return
      }

      if (decision === 'dismiss') {
        await dismiss(before?.signature ?? '')
        return
      }

      const fresh = await scan(own)

      if (decision === 'scan') {
        // A forced rescan always answers, including "there is nothing left": the
        // `decision` field has to be cleared or it would re-arm on every later
        // event for the rest of the session. The empty answer is recorded as an
        // explicit result so the card has something to report — an empty string
        // reads there as "no result yet" and hides the message the manual entry
        // point exists to show.
        if (fresh.candidates.length > 0) await arm(fresh)
        else await settleEmpty(fresh, LEGACY_RESULT_NOTHING_PENDING)
        return
      }

      // No decision. Before acting on the scan, require the plugin's OWN user
      // layer to be readable.
      //
      // `declared()` answers "does the user already set this path?" from that
      // layer, so while it is absent every migrated value looks unmigrated and
      // the scan re-offers the lot. Seen end to end: a restart after a
      // successful migration armed a spurious four-value offer, then retired it
      // a moment later once the section became readable — and because a client
      // sitting in `asking` does not poll, that transient state could strand the
      // prompt on screen with values that were already migrated. The settings
      // watcher treats the same condition as retryable rather than settled
      // (`fillDefaults`'s `user.readable` check); this is that rule here.
      if (ownLayer(own) === undefined) return

      // Arm only when this exact offer has not been declined. A dismissal that
      // never expires would make the user permanently deaf to data they
      // configure later, so the signature — not a boolean — decides.
      if (fresh.candidates.length === 0) {
        // Nothing left to offer. An armed prompt would be stale (the user may
        // have set these values by hand), so retire it once; the write clears
        // `pending`, so it cannot repeat.
        if (before?.pending === true) await settleEmpty(fresh)
        return
      }
      if (fresh.signature === before?.dismissedSignature) return
      if (before?.pending === true && before.signature === fresh.signature) return
      await arm(fresh)
    }

    const run = (): Promise<void> => {
      if (inFlight) {
        queued = true
        return current
      }
      inFlight = true
      let finish: () => void = () => {}
      let fail: (error: unknown) => void = () => {}
      const settled = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject })
      current = settled
      void (async () => {
        let passes = 0
        try {
          do {
            queued = false
            passes += 1
            if (!alive) break
            try {
              await pass()
            } catch (error) {
              log('legacy migration pass error:', error instanceof Error ? error.message : String(error))
            }
          } while (queued && passes < MAX_MIGRATION_PASSES)
          finish()
          // A burst that outran the budget must not swallow the wakeup it was
          // holding: the decision it carried would sit unhandled until the next
          // settings event. `inFlight` is cleared by the `finally` below, so this
          // starts a fresh chain rather than re-entering this one.
          if (queued) ctx.timeout(() => run(), 0)
        } catch (error) {
          fail(error)
        } finally {
          inFlight = false
        }
      })()
      return settled
    }

    for (const event of settingsChangeEvents('entry-config')) {
      const disposer = ctx.on(event, (...args: unknown[]) => {
        if (args[0] !== ns && args[0] !== SETTINGS_NAMESPACE) return undefined
        return run()
      })
      ctx.effect(() => () => {
        if (typeof disposer === 'function') disposer()
      }, `${LOG_PREFIX}: legacy migration watcher`)
    }

    ctx.effect(() => () => { alive = false }, `${LOG_PREFIX}: legacy migration lifetime`)

    // Two kicks. The timeout defers the first scan until after the Loader has
    // settled, so the section the plugin owns is published and its user layer
    // readable; the immediate call covers a host where it already is. Both feed
    // the same single-flight loop, so one pass runs at a time and the other is
    // coalesced as `queued`.
    //
    // The scheduled callback RETURNS its promise rather than `void`-ing it. The
    // existing settings watcher does `void tryOnce()` because a fill settles
    // within a couple of microtask turns; a scan pass is a much deeper chain, so
    // a caller that wants the settled state — the test harness in particular —
    // must be able to await the pass rather than count an arbitrary number of
    // turns. Returning a value from a timer callback is inert on the host.
    ctx.timeout(() => run(), 0)
    void run()
    return () => { alive = false }
  }, `${LOG_PREFIX}: legacy migration`)
}
