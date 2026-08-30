import { clientCapabilities } from '../compat/capabilities.js'
import { resolveCompatibility } from '../compat/version-adapter.js'
import type { ClientConnection, ClientResult, SettingsApi, SettingsDescribeValue, SettingsNamespace, SettingsOp } from './types.js'

export function directResult<T>(response: unknown): T {
  if (response !== null && typeof response === 'object' && 'result' in response) {
    const result = response.result
    if (result !== null && typeof result === 'object') return result as T
  }
  return response as T
}

export function settingsBridge(
  connection: ClientConnection | undefined,
  remoteSettings?: unknown,
): SettingsApi | undefined {
  const legacySettings = connection?.api?.settings
  const capabilities = clientCapabilities({ remoteSettings, legacySettings })
  const compatibility = resolveCompatibility({ capabilities })

  if (compatibility.profile === 'modern' && remoteSettings !== undefined) {
    const modern = remoteSettings as {
      describe: () => Promise<unknown>
      mutate: (ns: string, ops: readonly SettingsOp[], expectedRevision: number) => Promise<unknown>
    }
    return {
      describe: () => modern.describe().then((response) => directResult<ClientResult<SettingsDescribeValue>>(response)),
      mutate: (ns, ops, expectedRevision) => modern
        .mutate(ns, ops, expectedRevision)
        .then((response) => directResult<ClientResult<SettingsNamespace>>(response)),
    }
  }

  if (compatibility.profile === 'legacy' && legacySettings !== undefined) {
    const legacy = legacySettings as {
      describe: (input: Record<string, never>) => Promise<unknown>
      mutate: (input: { ns: string; ops: readonly SettingsOp[]; expectedRevision: number }) => Promise<unknown>
    }
    return {
      describe: () => legacy.describe({}).then((response) => directResult<ClientResult<SettingsDescribeValue>>(response)),
      mutate: (ns, ops, expectedRevision) => legacy
        .mutate({ ns, ops, expectedRevision })
        .then((response) => directResult<ClientResult<SettingsNamespace>>(response)),
    }
  }

  return undefined
}
