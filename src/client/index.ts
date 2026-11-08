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
import { componentEnabled, readComponentSwitches } from '@hytime/dsh-plugin-kit'
import type { ComponentKey, ComponentSwitchState } from '@hytime/dsh-plugin-kit'
import { apply as applySettings } from '@hytime/dsh-feature-settings-ui'
import { apply as applyComposer } from '@hytime/dsh-feature-composer'
import type { ClientContext } from '@hytime/dsh-plugin-kit'

export const name = '@hytime/dsh-thinking-effort'
export const inject = ['slots', 'connection', 'locale'] as const

/**
 * Register every client surface this plugin contributes, minus the ones the
 * profile switched off.
 *
 * The switch read is asynchronous because it asks the Host, so nothing mounts
 * until the answer arrives. That is deliberate: mounting first and unmounting
 * later would flash an OpenCode card that is about to disappear, and every
 * surface here registers a slot rather than returning markup that could simply
 * re-render.
 *
 * A Host that cannot answer (no inventory remote, a failed read) resolves to
 * "unknown", which `componentEnabled` treats as on — a working surface is the
 * safer default there.
 *
 * @param context - the client root context.
 */
export function apply(context: ClientContext): void {
  readComponentSwitches(context, (switches) => { mount(context, switches) })
}

/**
 * Mount the parts whose rows are live.
 *
 * @param context - the client root context.
 * @param switches - the Host's answer per component row.
 */
function mount(context: ClientContext, switches: Record<ComponentKey, ComponentSwitchState>): void {
  // The settings panel carries the OpenCode, compaction and subagent editors, so
  // its own row AND each of those rows decide whether the corresponding card
  // renders. Passing the map down keeps the panel from needing the remote.
  if (componentEnabled(switches.settings)) {
    applySettings(context, {
      opencode: componentEnabled(switches.opencode),
      compaction: componentEnabled(switches.compaction),
      subagent: componentEnabled(switches.subagent),
      migration: componentEnabled(switches.migration),
    })
  }
  if (componentEnabled(switches.composer)) applyComposer(context)
}
