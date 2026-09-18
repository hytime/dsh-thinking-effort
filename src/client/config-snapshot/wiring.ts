import { LLM_NAMESPACE, PLUGIN_NAMESPACE } from './types.js'
import { deepEqualJson, isRecord, userSectionOf } from './snapshot.js'
import type { ConfigSnapshot, SnapshotSection, WiringEndpoint, WiringReport } from './types.js'
import type { SettingsNamespace } from '../types.js'

/**
 * Provider fields that decide WHERE a request goes and WHICH credential it
 * carries, rather than what the model can do. A snapshot carries capability
 * configuration across machines; these fields are deployment wiring and are
 * withheld unless the user explicitly opts in.
 *
 * MAINTENANCE RULE: any future field that names an endpoint, names a
 * credential, injects a raw request header, or points configuration at
 * executable local code MUST be added here, with a test. Fields that only
 * shape a request the current endpoint already receives (api, transport,
 * timeouts, compat, reasoningEfforts, models, modelOverrides) are deliberately
 * absent — they neither redirect traffic nor carry credentials.
 */
export const PROVIDER_WIRING_KEYS = ['baseURL', 'apiKeyEnv', 'headers'] as const

/** The `opencodeSession.format` field that names an executable local module. */
export const PLUGIN_WIRING_SCRIPT_KEY = 'script'

export const EMPTY_WIRING_REPORT: WiringReport = { count: 0, providers: [], endpoints: [] }

/**
 * Exported because `planImport` merges one report per namespace. The report
 * types live in `types.ts` so this module depends on it one way only.
 */
export function mergeWiringReports(reports: readonly WiringReport[]): WiringReport {
  const kept = reports.filter((entry) => entry.count > 0)
  if (kept.length === 0) return EMPTY_WIRING_REPORT
  const script = kept.find((entry) => entry.script !== undefined)?.script
  return {
    count: kept.reduce((total, entry) => total + entry.count, 0),
    providers: kept.flatMap((entry) => entry.providers),
    endpoints: kept.flatMap((entry) => entry.endpoints),
    ...script === undefined ? {} : { script },
  }
}

function own(object: SnapshotSection, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

const EMPTY_ADJUSTED = (value: SnapshotSection): { readonly value: SnapshotSection; readonly report: WiringReport } =>
  ({ value, report: EMPTY_WIRING_REPORT })

/**
 * Compute one namespace's effective incoming section plus what was withheld.
 *
 * The rule is uniform: a wiring value the FILE supplies is always discarded and
 * this machine's value is always kept. Dropping the file's value alone is not
 * enough — `planImport` in `replace` mode treats a key the file omits as a
 * deletion, so this machine's value has to be written back or stripping the
 * wiring would silently delete the user's own endpoint.
 *
 * The report is narrower than the rule on purpose: it counts only wiring the
 * file ACTIVELY supplies that differs from this machine. An omission needs no
 * warning (nothing is being redirected) and would otherwise make every
 * self-exported snapshot look suspicious.
 */
export function adjustIncoming(
  ns: string,
  incoming: SnapshotSection,
  current: SnapshotSection,
  importWiring: boolean,
): { readonly value: SnapshotSection; readonly report: WiringReport } {
  if (ns === LLM_NAMESPACE) return adjustProviders(incoming, current, importWiring)
  if (ns === PLUGIN_NAMESPACE) return adjustScript(incoming, current, importWiring)
  return EMPTY_ADJUSTED(incoming)
}

function adjustProviders(
  incoming: SnapshotSection,
  current: SnapshotSection,
  importWiring: boolean,
): { readonly value: SnapshotSection; readonly report: WiringReport } {
  const fileProviders = incoming['providers']
  if (!isRecord(fileProviders)) return EMPTY_ADJUSTED(incoming)
  const localProviders = isRecord(current['providers']) ? current['providers'] as Record<string, unknown> : {}

  const providers: Record<string, unknown> = {}
  const changed: string[] = []
  const endpoints: WiringEndpoint[] = []
  let count = 0

  for (const [route, rawProfile] of Object.entries(fileProviders)) {
    if (!isRecord(rawProfile)) {
      providers[route] = rawProfile
      continue
    }
    const localProfile = isRecord(localProviders[route]) ? localProviders[route] as Record<string, unknown> : undefined
    const next: Record<string, unknown> = { ...rawProfile }

    for (const key of PROVIDER_WIRING_KEYS) {
      const fileProvides = own(rawProfile, key)
      const localProvides = localProfile !== undefined && own(localProfile, key)

      if (fileProvides && (!localProvides || !deepEqualJson(rawProfile[key], localProfile![key]))) {
        count += 1
        if (!changed.includes(route)) changed.push(route)
        if (key === 'baseURL' && typeof rawProfile[key] === 'string') {
          endpoints.push({ provider: route, baseURL: rawProfile[key] as string })
        }
      }

      if (importWiring) continue
      if (localProvides) next[key] = localProfile![key]
      else delete next[key]
    }

    // A route this machine does not have, with nothing left after stripping its
    // wiring, carries no capability to import.
    if (localProfile === undefined && Object.keys(next).length === 0) continue
    providers[route] = next
  }

  return {
    value: { ...incoming, providers },
    report: count === 0 ? EMPTY_WIRING_REPORT : { count, providers: changed, endpoints },
  }
}

function adjustScript(
  incoming: SnapshotSection,
  current: SnapshotSection,
  importWiring: boolean,
): { readonly value: SnapshotSection; readonly report: WiringReport } {
  const fileSession = incoming['opencodeSession']
  if (!isRecord(fileSession)) return EMPTY_ADJUSTED(incoming)
  const fileFormat = fileSession['format']
  if (!isRecord(fileFormat)) return EMPTY_ADJUSTED(incoming)

  const localSession = isRecord(current['opencodeSession']) ? current['opencodeSession'] as Record<string, unknown> : undefined
  const localFormat = localSession !== undefined && isRecord(localSession['format'])
    ? localSession['format'] as Record<string, unknown>
    : undefined
  const localProvides = localFormat !== undefined && own(localFormat, PLUGIN_WIRING_SCRIPT_KEY)
  const fileProvides = own(fileFormat, PLUGIN_WIRING_SCRIPT_KEY)
  const differs = fileProvides && (!localProvides || !deepEqualJson(fileFormat[PLUGIN_WIRING_SCRIPT_KEY], localFormat![PLUGIN_WIRING_SCRIPT_KEY]))
  const scriptValue = fileFormat[PLUGIN_WIRING_SCRIPT_KEY]
  const report: WiringReport = differs && typeof scriptValue === 'string' && scriptValue.length > 0
    ? { count: 1, providers: [], endpoints: [], script: scriptValue }
    : EMPTY_WIRING_REPORT

  if (importWiring) return { value: incoming, report }

  const nextFormat: Record<string, unknown> = { ...fileFormat }
  if (localProvides) nextFormat[PLUGIN_WIRING_SCRIPT_KEY] = localFormat![PLUGIN_WIRING_SCRIPT_KEY]
  else delete nextFormat[PLUGIN_WIRING_SCRIPT_KEY]

  return {
    value: { ...incoming, opencodeSession: { ...fileSession, format: nextFormat } },
    report,
  }
}

/** What a snapshot would change about this machine's wiring, without applying it. */
export function wiringReport(
  snapshot: ConfigSnapshot,
  namespaces: readonly SettingsNamespace[],
): WiringReport {
  return mergeWiringReports(
    [LLM_NAMESPACE, PLUGIN_NAMESPACE].map((ns) =>
      adjustIncoming(ns, snapshot.sections[ns] ?? {}, userSectionOf(namespaces, ns), false).report),
  )
}
