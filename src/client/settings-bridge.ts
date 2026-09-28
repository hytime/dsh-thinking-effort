import { clientCapabilities } from '../compat/capabilities.js'
import { resolveCompatibility } from '../compat/version-adapter.js'
import type { ClientConnection, ClientResult, ConfigFormFace, SettingsApi, SettingsDescribeValue, SettingsNamespace, SettingsOp } from './types.js'

export function directResult<T>(response: unknown): T {
  if (response !== null && typeof response === 'object' && 'result' in response) {
    const result = response.result
    if (result !== null && typeof result === 'object') return result as T
  }
  return response as T
}

/**
 * Narrow the optional `ctx.configForms` service by method shape.
 *
 * Inject-free on purpose: `configForms` is absent on every host before 0.1.7,
 * and a declared-but-missing service parks the consuming fiber. A value that is
 * not an object, or carries no callable `get`, yields `undefined` — and then
 * the bridge attaches no `formFor` at all.
 *
 * The returned closure is deliberately thin: it re-asks the service on every
 * call, which is what lets a late-activated `configForms` reach an already
 * mounted editor when the caller passes a live view.
 *
 * @param configForms - The raw fourth argument handed to {@link settingsBridge}.
 * @returns A `formFor` lookup, or `undefined` when no service face is present.
 */
function formFace(configForms: unknown): ((entryId: string) => ConfigFormFace | undefined) | undefined {
  const service = configForms as { get?: unknown } | undefined | null
  if (service === null || service === undefined || typeof service.get !== 'function') return undefined
  return (entryId: string) => (service.get as (id: string) => ConfigFormFace | undefined)(entryId) ?? undefined
}

/**
 * Build the settings transport one client generation exposes.
 *
 * `configForms` is optional and last so every existing 1-to-3 argument call
 * keeps the exact object it built before: when the probe finds no service face,
 * no `formFor` key is attached, so a legacy host's `SettingsApi` is unchanged
 * key for key. When the host does expose `ctx.configForms` (DSH 0.1.7 and
 * later), `formFor` joins BOTH branches — the form family is orthogonal to
 * whichever `describe`/`mutate` pair the generation uses.
 *
 * @param connection - Client connection owning the possibly-legacy settings API.
 * @param remoteSettings - The modern `remote.settings` service, when present.
 * @param addLanguage - The locale `addLanguage` face, for capability detection.
 * @param configForms - The optional `ctx.configForms` service, or a live view of it.
 * @returns The transport, or `undefined` when the host exposes no settings API.
 */
export function settingsBridge(
  connection: ClientConnection | undefined,
  remoteSettings?: unknown,
  addLanguage?: unknown,
  configForms?: unknown,
): SettingsApi | undefined {
  const formFor = formFace(configForms)
  const legacySettings = connection?.api?.settings
  const legacyCapabilities = clientCapabilities({ legacySettings, addLanguage })
  if (legacyCapabilities.settings === 'legacy' && legacySettings !== undefined) {
    const legacy = legacySettings as {
      describe: (input: Record<string, never>) => Promise<unknown>
      mutate: (input: { ns: string; ops: readonly SettingsOp[]; expectedRevision: number }) => Promise<unknown>
    }
    return {
      externalLanguages: legacyCapabilities.externalLanguages,
      compatibilityProfile: resolveCompatibility({ capabilities: legacyCapabilities }).profile,
      describe: () => legacy.describe({}).then((response) => directResult<ClientResult<SettingsDescribeValue>>(response)),
      mutate: (ns, ops, expectedRevision) => legacy
        .mutate({ ns, ops, expectedRevision })
        .then((response) => directResult<ClientResult<SettingsNamespace>>(response)),
      ...(formFor === undefined ? {} : { formFor }),
    }
  }

  const capabilities = clientCapabilities({ remoteSettings, legacySettings, addLanguage })
  const compatibility = resolveCompatibility({ capabilities })

  if (compatibility.profile === 'modern' && remoteSettings !== undefined) {
    const modern = remoteSettings as {
      describe: () => Promise<unknown>
      mutate: (ns: string, ops: readonly SettingsOp[], expectedRevision: number) => Promise<unknown>
    }
    return {
      externalLanguages: capabilities.externalLanguages,
      compatibilityProfile: compatibility.profile,
      describe: () => modern.describe().then((response) => directResult<ClientResult<SettingsDescribeValue>>(response)),
      mutate: (ns, ops, expectedRevision) => modern
        .mutate(ns, ops, expectedRevision)
        .then((response) => directResult<ClientResult<SettingsNamespace>>(response)),
      ...(formFor === undefined ? {} : { formFor }),
    }
  }

  return undefined
}
