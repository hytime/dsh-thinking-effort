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
import { createComponentSwitchStore, readComponentSwitches } from '@hytime/dsh-plugin-kit'
import { apply as applySettings } from '@hytime/dsh-feature-settings-ui'
import { apply as applyComposer } from '@hytime/dsh-feature-composer'
import type { ClientContext } from '@hytime/dsh-plugin-kit'

export const name = '@hytime/dsh-thinking-effort'
export const inject = ['slots', 'connection', 'locale'] as const

/**
 * Register every client surface this plugin contributes.
 *
 * Mounting is NOT gated on the switches: a slot registers once and cannot be
 * re-registered, so deciding here would mean a row toggled in the plugin page
 * needed a page refresh. Instead each surface receives the store and re-reads it
 * per render, which is what makes the change visible immediately.
 *
 * The store starts at "every part on" so the first frame renders the full panel;
 * the first Host answer then corrects it.
 *
 * @param context - the client root context.
 */
export function apply(context: ClientContext): void {
  const switches = createComponentSwitchStore()
  readComponentSwitches(context, switches.update)
  // Both surfaces take the store, not a snapshot: the Composer seat's own
  // registration is a slot as well, so it re-checks on every render.
  applySettings(context, switches.store)
  applyComposer(context, switches.store)
}
