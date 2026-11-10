/**
 * Announce Loader row changes to the plugin's own client surfaces.
 *
 * The browser bundle is one file for seven rows, so each surface renders from
 * the enablement the Host reports rather than from what the Loader mounted. The
 * client can read that from `remote.pluginInventory`, but it has no way to know
 * WHEN to read it again: toggling a row in the plugin page calls
 * `pluginManager.setPluginEnabled`, which writes `cordis.patch.yml` and reloads
 * the row without emitting any forwardable event — `plugin-manager/changed`
 * covers install, remove and update only. The result was a settings panel or
 * Composer seat that kept rendering a component the user had just switched off
 * until the page was reloaded.
 *
 * The Host side of the fix is this watcher. It listens to the Loader's own
 * `loader/volatile-update`, which fires for exactly those row changes, and
 * bumps {@link SWITCHES_STAMP_FIELD} in the plugin's section. That write raises
 * `settings/document-updated`, which IS forwardable, so the ordinary settings
 * channel carries the signal to the client with no new event plumbing.
 *
 * The field is a counter, not a timestamp: two toggles inside one clock tick are
 * ordinary and a timestamp would render them indistinguishable.
 *
 * @module @hytime/dsh-feature-levels/switches-stamp
 */
import { AsyncResource } from 'node:async_hooks'
import { LOG_PREFIX, readSettingsSectionUser, pluginSectionId, settingsModelForRuntime } from '@hytime/dsh-plugin-kit'
import type { HostContext } from '@hytime/dsh-plugin-kit'

/** The section field the counter lives in. */
const SWITCHES_STAMP_FIELD = 'switchesStamp'

/** One settings-service write, as this module needs it. */
interface MutableSettings {
  describe?: () => unknown
  mutate?: (ns: string, ops: unknown, revision?: number) => unknown
}

/**
 * The revision the section is currently at, so the write is fenced against a
 * concurrent edit. Absent or unreadable answers `undefined`, which the host
 * accepts as "write unconditionally" — the counter is additive and losing a
 * race costs one missed refresh, never data.
 *
 * @param settings - the settings service.
 * @param ns - the plugin section id.
 * @returns the revision, or undefined when it cannot be read.
 */
function revisionOf(settings: MutableSettings, ns: string): number | undefined {
  try {
    const described = settings.describe?.()
    if (!Array.isArray(described)) return undefined
    const row = described.find((candidate) => {
      const record = candidate as { ns?: unknown } | null
      return record !== null && typeof record === 'object' && record.ns === ns
    }) as { revision?: unknown } | undefined
    return typeof row?.revision === 'number' ? row.revision : undefined
  } catch {
    return undefined
  }
}

/**
 * Keep the counter in step with the Loader.
 *
 * Installation writes nothing on a host that does not publish the settings
 * service this plugin targets: the client already falls back to rendering every
 * part there, and writing into a section the host does not expose would only log
 * failures.
 *
 * @param ctx - the root entry's context.
 */
export function installSwitchesStampWatcher(ctx: HostContext): void {
  const lookup = ctx.get
  if (lookup === undefined) return
  const settings = lookup.call(ctx, 'settings') as MutableSettings | undefined
  if (settings === undefined || typeof settings.mutate !== 'function') return
  // The namespace model has no `settings/document-updated`, so no channel would
  // carry the counter and there is nothing to install. The floor is 0.1.7, but
  // the check keeps this honest if that ever widens again. The model is read
  // from the SERVICE, not from the context: the same host version can be reached
  // through a compatibility provider.
  if (settingsModelForRuntime({ settings }) !== 'entry-config') return

  const ns = pluginSectionId()
  /**
   * A context the host accepts a settings write from.
   *
   * `loader/volatile-update` is delivered INSIDE the HMR transaction that
   * changed the row, and a settings write attempted there fails with
   * "HMR transactions cannot be nested". This resource is created while the
   * plugin is applied — outside any transaction — so entering it before the
   * write gives that write a context the host accepts. `migration`'s watcher
   * solves the same problem the same way.
   */
  const scope = new AsyncResource('dsh-thinking-effort:switches-stamp')
  /**
   * Report a write that could not be made.
   *
   * A detached watcher has no caller to answer, and this is a UI-refresh signal
   * rather than user data, so a failure is logged and the next Loader event
   * tries again instead of surfacing an error nobody can act on.
   */
  const report = (error: unknown): void => {
    // eslint-disable-next-line no-console
    console.warn(`${LOG_PREFIX}: could not announce a component switch change`, error)
  }
  const bump = (): void => {
    const current = readSettingsSectionUser(settings, ns)
    const held = current === undefined || current === null
      ? undefined
      : (current as Record<string, unknown>)[SWITCHES_STAMP_FIELD]
    const next = (typeof held === 'number' && Number.isFinite(held) ? held : 0) + 1
    const mutate = settings.mutate
    if (mutate === undefined) return
    try {
      // Entered synchronously so the call itself runs outside the HMR
      // transaction, not merely its resolution.
      const write = scope.runInAsyncScope(() =>
        mutate.call(settings, ns, [{ op: 'set', path: [SWITCHES_STAMP_FIELD], value: next }], revisionOf(settings, ns)))
      // A host that answers synchronously rejects through the promise; a
      // detached watcher has no caller to report to, so the failure is logged
      // and the next Loader event tries again.
      Promise.resolve(write).catch(report)
    } catch (error) {
      report(error)
    }
  }

  // The Loader fires this for every row-configuration change, which is exactly
  // the set `setPluginEnabled` produces. The event carries no plugin argument,
  // so the watcher cannot narrow it further — and does not need to, because the
  // client re-reads the whole inventory either way.
  ctx.effect(() => {
    const disposer = ctx.on('loader/volatile-update', bump)
    // `ctx.on` answers `unknown` on this surface; only a callable is a disposer.
    return typeof disposer === 'function' ? disposer as () => void : undefined
  }, `${LOG_PREFIX}: component switch announcement`)
}
