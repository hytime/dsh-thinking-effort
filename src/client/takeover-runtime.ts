import {
  resolveTakeoverGatewayCompat,
  resolveTakeoverProviders,
} from '../compat/gateway/resolve.js'
import type { GatewayCompatResolution } from '../compat/gateway/types.js'
import type {
  PiAiProviderProfile,
  PiAiSection,
  TakeoverSection,
} from '../compat/gateway/takeover.js'
import type {
  ClientResult,
  SettingsApi,
  SettingsDescribeValue,
  SettingsNamespace,
} from './types.js'

export interface TakeoverRuntimeResolution {
  readonly providers: readonly string[]
  readonly compat: readonly GatewayCompatResolution[]
}

const EMPTY_RESOLUTION: TakeoverRuntimeResolution = { providers: [], compat: [] }

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function piAiValue(namespace: SettingsNamespace | undefined): PiAiSection | undefined {
  const value = record(namespace?.value)
  return value as PiAiSection | undefined
}

function takeoverValue(namespace: SettingsNamespace | undefined): TakeoverSection | undefined {
  const value = record(namespace?.value)
  return value as TakeoverSection | undefined
}

function modelNames(profile: PiAiProviderProfile | undefined): Array<string | undefined> {
  if (profile === undefined) return [undefined]
  const names: string[] = []
  if (Array.isArray(profile.models)) {
    for (const model of profile.models) {
      const row = record(model)
      if (typeof row?.id === 'string') names.push(row.id)
    }
  }
  const overrides = record(profile.modelOverrides)
  if (overrides !== undefined) names.push(...Object.keys(overrides))
  return names.length === 0 ? [undefined] : names
}

export function resolveTakeoverDescription(
  settings: Pick<SettingsApi, 'compatibilityProfile'>,
  response: ClientResult<SettingsDescribeValue>,
): TakeoverRuntimeResolution {
  if (!response.ok) return EMPTY_RESOLUTION
  const namespaces = response.value?.namespaces
  if (!Array.isArray(namespaces)) return EMPTY_RESOLUTION
  const piAiNamespace = namespaces.find((namespace) => namespace.ns === 'llm-pi-ai')
  if (piAiNamespace === undefined) return EMPTY_RESOLUTION
  const takeoverNamespace = namespaces.find((namespace) => namespace.ns === 'llm-openai-completions')
  const piAi = piAiValue(piAiNamespace)
  const takeover = takeoverValue(takeoverNamespace)
  const input = {
    runtimeProfile: settings.compatibilityProfile,
    descriptorSchema: piAiNamespace.schema,
    piAi,
    takeover,
  }
  const providers = resolveTakeoverProviders(input)
  const profiles = record(piAi?.providers)
  if (profiles === undefined) return { providers, compat: [] }

  const compat: GatewayCompatResolution[] = []
  for (const [provider, value] of Object.entries(profiles)) {
    const profile = record(value) as PiAiProviderProfile | undefined
    for (const model of modelNames(profile)) {
      const resolution = resolveTakeoverGatewayCompat({ ...input, provider, ...(model === undefined ? {} : { model }) })
      if (resolution !== undefined) compat.push(resolution)
    }
  }
  return { providers, compat }
}

export async function resolveTakeoverSettings(settings: SettingsApi): Promise<TakeoverRuntimeResolution> {
  return resolveTakeoverDescription(settings, await settings.describe())
}

export function observeTakeoverSettings(
  settings: SettingsApi,
  onResolution: (resolution: TakeoverRuntimeResolution) => void,
): SettingsApi {
  return {
    ...settings,
    describe: () => settings.describe().then((response) => {
      onResolution(resolveTakeoverDescription(settings, response))
      return response
    }),
    mutate: (ns, ops, expectedRevision) => settings.mutate(ns, ops, expectedRevision).then((response) => {
      void resolveTakeoverSettings(settings).then(onResolution).catch(() => undefined)
      return response
    }),
  }
}

export const emptyTakeoverRuntimeResolution = EMPTY_RESOLUTION
