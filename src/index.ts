/**
 * The core entry: the default-levels fill, plus the plugin's settings section.
 *
 * This entry keeps the `thinking-effort` id its bundle row always had. Existing
 * profiles carry `- id: thinking-effort` with their whole `config` under it, so
 * renaming the id would strand that configuration on upgrade.
 *
 * The other six features are their own entries — see `src/entries/`. Nothing
 * else is installed here: a feature mounted twice would register its listeners
 * twice, and the point of splitting the bundle is that each row owns exactly
 * one thing.
 */
import { mark } from '@hytime/dsh-plugin-kit/host'
import { installSettingsWatcher, installSwitchesStampWatcher } from '@hytime/dsh-feature-levels'
import type { HostContext } from '@hytime/dsh-plugin-kit'

export const name = '@hytime/dsh-thinking-effort'
export const inject = ['settings', 'timer'] as const

/**
 * The Loader entry's config schema. DSH 0.1.7 derives the settings form from
 * it, so it must stay exported from the package entry.
 */
export { Config } from '@hytime/dsh-feature-levels'

export function apply(ctx: HostContext): void {
  mark('apply')
  installSettingsWatcher(ctx)
  // The client surfaces render from the Loader's row enablement, and a row
  // toggled in the plugin page emits no forwardable event. This watcher turns
  // the Loader's own update into a settings write, which reaches them through
  // the ordinary settings channel.
  installSwitchesStampWatcher(ctx)
}
