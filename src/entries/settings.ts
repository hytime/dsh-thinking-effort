/**
 * The settings-panel entry.
 *
 * A bundle entry is a HOST-plane plugin: the Loader runs its `apply` in the
 * Node process. The panel itself is browser code and ships in `lib/client.js`,
 * which `dsh.client` declares once for the whole package. So this entry has no
 * host behaviour — it exists so the panel appears as its own toggleable
 * component in the plugin manager, and so turning it off stops the client
 * registration without touching any other feature.
 */
export const name = '@hytime/dsh-thinking-effort/settings'

export function apply(): void {
  // Intentionally empty: the settings panel is client-only.
}
