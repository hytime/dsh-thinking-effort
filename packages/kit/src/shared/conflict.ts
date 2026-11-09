/**
 * Whether a refused settings write was refused because the section moved since
 * the caller last read it.
 *
 * Three call sites grew three different tests. This is their union, ordered by
 * how much the transport guarantees:
 *
 * - `settings/conflict` is the modern Remote's stable code.
 * - `SETTINGS_CONFLICT` is the in-process `SettingsConflictError.code`.
 * - Neither survives a legacy bridge that only forwards the message text, so
 *   the message is matched as a last resort. `changed since it was read` is
 *   `SettingsConflictError`'s own wording; a bare `conflict` catches the
 *   wrapper message a profile editor produces.
 */
export function isSettingsConflict(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  if (code === 'settings/conflict' || code === 'SETTINGS_CONFLICT') return true
  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') return false
  return /changed since it was read/i.test(message) || /conflict/i.test(message)
}
