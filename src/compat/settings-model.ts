/**
 * Which settings architecture the running host exposes.
 *
 * `namespace` — the rc.7 through 0.1.6 lines: a plugin registers its own
 * namespace schema through `register`/`installSection`, reads it back with
 * `get(ns)`, and the service emits `settings/updated` when a section changes.
 *
 * `entry-config` — 0.1.7 and later: forms are derived from each Loader entry's
 * own `Config` schema, so `register`, `installSection` and `get` no longer
 * exist, a plugin owns its section by being a configured entry, only fields
 * marked `.volatile()` are editable, and changes ride
 * `settings/document-updated` instead.
 */
export type SettingsModel = 'namespace' | 'entry-config'

/**
 * The Loader entry id this plugin declares in `cordis.patch.yml`. Under the
 * `entry-config` model it is also the id of the plugin's own settings section,
 * which is how a caller with no fiber to read a live id from addresses that
 * section. Under the `namespace` model no section carries it — the plugin
 * registers `dsh-thinking-effort` instead — so a miss means "not this model"
 * rather than an error.
 */
export const PLUGIN_ENTRY_ID = 'thinking-effort'

function method(value: unknown, name: string): ((...args: unknown[]) => unknown) | undefined {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return undefined
  const candidate = Reflect.get(value, name)
  return typeof candidate === 'function' ? candidate as (...args: unknown[]) => unknown : undefined
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/**
 * Detect the settings model from the live service rather than from a version
 * string, because the same version can be reached through a compatibility
 * provider. `undefined` means the service exposes neither shape.
 */
export function settingsModelOf(settings: unknown): SettingsModel | undefined {
  if (settings === undefined || settings === null) return undefined
  if (method(settings, 'register') !== undefined || method(settings, 'installSection') !== undefined) {
    return 'namespace'
  }
  return method(settings, 'describe') === undefined ? undefined : 'entry-config'
}

/**
 * The events that report a change to a settings section. Only the
 * `namespace` model emits `settings/updated`; `settings/document-updated`
 * exists under both, but it is the only one the `entry-config` model emits.
 */
export function settingsChangeEvents(model: SettingsModel): readonly string[] {
  return model === 'entry-config'
    ? ['settings/document-updated']
    : ['settings/updated']
}

/** The `describe()` descriptor of one section, or `undefined` when it is absent or unreadable. */
function descriptorOf(settings: unknown, namespace: string): Record<string, unknown> | undefined {
  const describe = method(settings, 'describe')
  if (describe === undefined) return undefined
  try {
    const descriptors = describe.call(settings)
    if (!Array.isArray(descriptors)) return undefined
    return record(descriptors.find((candidate) => String(record(candidate)?.ns) === namespace))
  } catch {
    return undefined
  }
}

/**
 * Read one section's value under either model. The `entry-config` model has no
 * `get`, so the value is projected out of `describe()` — the same resolved
 * shape the configuration UI reads. A missing section and a throwing service
 * both read as `undefined`.
 */
export function readSettingsSection(settings: unknown, namespace: string): unknown {
  const get = method(settings, 'get')
  if (get !== undefined) {
    try {
      const value = get.call(settings, namespace)
      if (value !== undefined) return value
    } catch {
      // Fall through to the descriptor read below.
    }
  }

  return descriptorOf(settings, namespace)?.value
}

/**
 * Read one section's user-override layer under either model. A descriptor's
 * `user` layer holds only what the user explicitly wrote, which is the layer
 * that can express "unset" for a field a schema supplies a default for; the
 * resolved `value` cannot. A missing section, a section without a user layer,
 * and a throwing service all read as `undefined`.
 */
export function readSettingsSectionUser(settings: unknown, namespace: string): unknown {
  return descriptorOf(settings, namespace)?.user
}

/**
 * The id a plugin's own configuration section carries. Under the
 * `entry-config` model a section is addressed by its Loader entry id rather
 * than by a registered namespace name.
 */
export function settingsEntryId(ctx: unknown, fallback: string): string {
  const id = record(ctx)?.fiber
  const entryId = record(record(id)?.entry)?.options
  const value = record(entryId)?.id
  return typeof value === 'string' && value.length > 0 ? value : fallback
}
