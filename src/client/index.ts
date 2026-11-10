/**
 * The client bundle's single entry.
 *
 * `dsh.client` is declared per package, so the browser artifact is one file no
 * matter how many Cordis entries the profile enables: the Loader fetches and
 * runs this module ONCE. That is why the switches have to be read here rather
 * than inferred from what mounted — a disabled `thinking-effort-opencode` row
 * stops the host from injecting headers, but it does not stop this file from
 * loading, so the settings panel would otherwise keep rendering an OpenCode card
 * for a feature that is not running.
 *
 * Each client package exposes parts rather than one `apply` for exactly this
 * reason: the panel and the Composer seat are separate Loader rows, so turning
 * one off must not take the other with it.
 *
 * Keeping the entry at this path is deliberate — the emitted
 * `window.__ModuleLoader__.load({ id: '@hytime/dsh-thinking-effort' })` banner and
 * the `dsh.client` declaration both assume it.
 */
import { componentEnabled, createComponentSwitchStore, readComponentSwitches } from '@hytime/dsh-plugin-kit'
import { apply as applySettings } from '@hytime/dsh-feature-settings-ui'
import { apply as applyComposer } from '@hytime/dsh-feature-composer'
import type { ClientContext } from '@hytime/dsh-plugin-kit'

export const name = '@hytime/dsh-thinking-effort'
export const inject = ['slots', 'connection', 'locale'] as const

/**
 * Mount the parts whose Loader rows are live.
 *
 * A slot registers once and cannot be unregistered, so a row switched off has to
 * be excluded at mount rather than rendered as nothing: registering the panel
 * anyway would leave its navigation entry in Settings pointing at an empty page.
 * The cost is that a row toggled while this page is open needs a reload — which
 * the panel states outright, and which the Host requires anyway.
 *
 * `componentEnabled` treats `unknown` as on: a host that cannot report its
 * inventory — no `remote.pluginInventory`, a failed read — must keep every
 * surface rather than lose them all to a diagnostic it never asked for.
 *
 * @param switches - the Host's answer per component row.
 * @param context - the client root context.
 */
/** The switch map resolved for this page load. */
type Switches = Record<string, 'on' | 'off' | 'unknown'>

function mount(context: ClientContext, switches: Switches): void {
  // One store seeded with the answer this decision used: the panel gates its own
  // cards from it, so seeding a second `unknown` map would let a card render for
  // a row this mount already saw as off.
  const store = createComponentSwitchStore()
  store.update(switches as never)
  if (componentEnabled(switches.settings)) applySettings(context, store.store)
  if (componentEnabled(switches.composer)) applyComposer(context, store.store)
}

/**
 * How long to wait for the inventory before mounting with everything on.
 *
 * The dependency arrives with the connection rather than synchronously — measured
 * at ~160 ms on a local host — so a zero-delay fallback would always win and
 * report `unknown`, which `componentEnabled` reads as on. That was the whole bug:
 * the panel mounted on every profile regardless of its row.
 *
 * The wait is bounded because a host that never publishes the remote must still
 * get a panel; `componentEnabled` treats a missing answer as on for that reason.
 */
const SWITCHES_TIMEOUT_MS = 3000

/**
 * Read the switch map, or fall back to "everything on" once the wait expires.
 *
 * `readComponentSwitches` calls back only when the Host actually answers, so the
 * timeout is what covers an older host that publishes no inventory remote.
 *
 * @param context - the client root context.
 * @returns the resolved map, never rejecting.
 */
function switchesOf(context: ClientContext): Promise<Switches> {
  return new Promise<Switches>((resolve) => {
    let settled = false
    const settle = (switches: Switches): void => {
      if (settled) return
      settled = true
      resolve(switches)
    }
    readComponentSwitches(context, (switches) => settle(switches as Switches))
    // `setTimeout` is absent in the artifact sandbox the smoke test evaluates
    // this module in, so the timer is taken from the global only when it exists;
    // without one the read is simply awaited untimed.
    const timer = (globalThis as { setTimeout?: (run: () => void, ms: number) => unknown }).setTimeout
    if (typeof timer === 'function') {
      timer.call(globalThis, () => settle(unknownSwitches()), SWITCHES_TIMEOUT_MS)
    }
  })
}

/** Every switch unknown, which `componentEnabled` renders as on. */
function unknownSwitches(): Switches {
  const keys = ['levels', 'settings', 'opencode', 'compaction', 'subagent', 'migration', 'composer'] as const
  return Object.fromEntries(keys.map((key) => [key, 'unknown'])) as Switches
}

/**
 * Register every client surface whose row is on.
 *
 * @param context - the client root context.
 */
export function apply(context: ClientContext): void {
  void switchesOf(context).then((switches) => { mount(context, switches) })
}
