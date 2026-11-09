/**
 * The Composer-seat entry.
 *
 * Like the settings panel, the seat is browser code shipped in the one
 * `lib/client.js`. This entry carries no host behaviour; it exists so the seat
 * is its own component in the plugin manager.
 */
export const name = '@hytime/dsh-thinking-effort/composer'

export function apply(): void {
  // Intentionally empty: the Composer seat is client-only.
}
