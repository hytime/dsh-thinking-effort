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
import { hasLayeredModelSourceConflict, hasModelSourceConflict } from '../compat/model-source.js'
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

export interface TakeoverRuntimeStore {
  readonly getSnapshot: () => TakeoverRuntimeResolution
  readonly subscribe: (listener: () => void) => () => void
  update(resolution: TakeoverRuntimeResolution): void
  dispose(): void
}

export function createTakeoverRuntimeStore(): TakeoverRuntimeStore {
  let current = EMPTY_RESOLUTION
  let active = true
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe: (listener) => {
      if (!active) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    update: (resolution) => {
      if (!active) return
      current = resolution
      for (const listener of listeners) listener()
    },
    dispose: () => {
      active = false
      current = EMPTY_RESOLUTION
      listeners.clear()
    },
  }
}

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
  if (profile === undefined || hasModelSourceConflict(profile)) return []
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
  const providers = resolveTakeoverProviders(input).filter((provider) => !hasLayeredModelSourceConflict(piAiNamespace, provider))
  const profiles = record(piAi?.providers)
  if (profiles === undefined) return { providers, compat: [] }

  const compat: GatewayCompatResolution[] = []
  for (const [provider, value] of Object.entries(profiles)) {
    if (!providers.includes(provider)) continue
    const profile = record(value) as PiAiProviderProfile | undefined
    const providerResolution = resolveTakeoverGatewayCompat({ ...input, provider })
    if (providerResolution !== undefined) compat.push(providerResolution)
    for (const model of modelNames(profile)) {
      if (model === undefined) continue
      const resolution = resolveTakeoverGatewayCompat({ ...input, provider, model })
      if (resolution !== undefined) compat.push(resolution)
    }
  }
  return { providers, compat }
}

export async function resolveTakeoverSettings(settings: SettingsApi): Promise<TakeoverRuntimeResolution> {
  return resolveTakeoverDescription(settings, await settings.describe())
}

export interface ObservedSettingsApi extends SettingsApi {
  dispose(): void
}

export function observeTakeoverSettings(
  settings: SettingsApi,
  onResolution: (resolution: TakeoverRuntimeResolution) => void,
): ObservedSettingsApi {
  let active = true
  let sequence = 0
  let mutationGeneration = 0
  let pendingRefreshGeneration: number | undefined
  const nextSequence = (): number => {
    sequence += 1
    return sequence
  }
  const publish = (
    requestSequence: number,
    requestGeneration: number,
    response: ClientResult<SettingsDescribeValue>,
    refresh: boolean,
  ): void => {
    if (!active || requestGeneration !== mutationGeneration) return
    if (refresh) {
      if (pendingRefreshGeneration !== requestGeneration) return
      pendingRefreshGeneration = undefined
      onResolution(resolveTakeoverDescription(settings, response))
      return
    }
    if (pendingRefreshGeneration === requestGeneration || requestSequence !== sequence) return
    onResolution(resolveTakeoverDescription(settings, response))
  }
  return {
    ...settings,
    describe: () => {
      const requestSequence = nextSequence()
      const requestGeneration = mutationGeneration
      return settings.describe().then((response) => {
        publish(requestSequence, requestGeneration, response, false)
        return response
      })
    },
    mutate: async (ns, ops, expectedRevision) => {
      const response = await settings.mutate(ns, ops, expectedRevision)
      if (!response.ok || !active) return response
      mutationGeneration += 1
      const refreshGeneration = mutationGeneration
      const refreshSequence = nextSequence()
      pendingRefreshGeneration = refreshGeneration
      void settings.describe().then((description) => {
        publish(refreshSequence, refreshGeneration, description, true)
      }).catch(() => {
        if (!active || pendingRefreshGeneration !== refreshGeneration) return
        pendingRefreshGeneration = undefined
        onResolution(EMPTY_RESOLUTION)
      })
      return response
    },
    dispose: () => {
      active = false
      sequence += 1
      pendingRefreshGeneration = undefined
    },
  }
}

export const emptyTakeoverRuntimeResolution = EMPTY_RESOLUTION
