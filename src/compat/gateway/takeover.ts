/** Read-only interoperability helpers for the optional OpenAI-completions takeover. */

import {
  capabilitiesForVersion,
  takeoverSupportedForVersion,
} from '../version-map.js'
import type { DshVersionCapabilities } from '../version-map.js'

export const TAKEOVER_NAMESPACE = 'llm-openai-completions'
export const PI_AI_NAMESPACE = 'llm-pi-ai'

export interface PiAiModelRow {
  readonly id?: unknown
  readonly reasoningEfforts?: unknown
  readonly compat?: unknown
}

export interface PiAiProviderProfile {
  readonly api?: unknown
  readonly baseURL?: unknown
  readonly models?: unknown
  readonly modelOverrides?: unknown
  readonly compat?: unknown
  readonly [key: string]: unknown
}

export interface PiAiSection {
  readonly providers?: Record<string, PiAiProviderProfile>
}

export interface TakeoverSection {
  readonly enabled?: unknown
  readonly providers?: unknown
}

export interface TakeoverProvidersInput {
  readonly version?: unknown
  readonly piAi?: PiAiSection
  readonly takeover?: TakeoverSection
}

export interface TakeoverGatewayCompatInputs {
  readonly providerCompat?: unknown
  readonly modelCompat?: unknown
}

const OFFICIAL_HOST_RE = /(?:^|\.)(?:deepseek\.com|openai\.com|openrouter\.ai|anthropic\.com|googleapis\.com|ai\.google\.dev|mistral\.ai|x\.ai)$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEffortsTable(value: unknown): boolean {
  return isRecord(value)
}

function modelRows(profile: PiAiProviderProfile | undefined): PiAiModelRow[] {
  if (profile === undefined) return []
  const rows: PiAiModelRow[] = []
  if (Array.isArray(profile.models)) {
    rows.push(...profile.models.filter(isRecord))
  }
  if (isRecord(profile.modelOverrides)) {
    rows.push(...Object.values(profile.modelOverrides).filter(isRecord))
  }
  return rows
}

/** Whether this profile points to a custom OpenAI-compatible endpoint. */
export function isCustomOpenAiGateway(profile: PiAiProviderProfile | undefined): boolean {
  if (profile?.api !== 'openai-completions' || typeof profile.baseURL !== 'string' || profile.baseURL.trim() === '') {
    return false
  }
  try {
    const endpoint = new URL(profile.baseURL)
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') return false
    return !OFFICIAL_HOST_RE.test(endpoint.hostname)
  } catch {
    return false
  }
}

/** Whether any shared llm-pi-ai model declares thinking capability. */
export function declaresThinking(profile: PiAiProviderProfile | undefined): boolean {
  return modelRows(profile).some((model) => isEffortsTable(model.reasoningEfforts))
}

/** Identify custom thinking routes only when the mapped runtime allows takeover. */
export function identifyTakeoverProviders(
  section: PiAiSection | undefined,
  capabilities?: DshVersionCapabilities,
): string[] {
  if (capabilities?.takeoverTransport !== 'optional') return []
  const providers = section?.providers
  if (!isRecord(providers)) return []
  return Object.entries(providers)
    .filter(([, profile]) => isCustomOpenAiGateway(profile) && declaresThinking(profile))
    .map(([provider]) => provider)
}

/**
 * Read the optional transport-layer takeover list. `null` means the transport
 * plugin is not installed; an empty array means installed but inactive.
 */
export function takeoverProvidersOf(section: TakeoverSection | undefined): string[] | null {
  if (section === undefined) return null
  if (section.enabled !== true || !Array.isArray(section.providers)) return []
  return section.providers.filter((provider): provider is string => typeof provider === 'string')
}

/**
 * Resolve the providers eligible for the current runtime. Unknown versions and
 * unsupported mapped versions intentionally produce no takeover candidates.
 */
export function resolveTakeoverProviders(input: TakeoverProvidersInput): string[] {
  if (typeof input.version !== 'string' || !takeoverSupportedForVersion(input.version)) return []
  const capabilities = capabilitiesForVersion(input.version)
  if (capabilities === undefined) return []
  const identified = identifyTakeoverProviders(input.piAi, capabilities)
  const configured = takeoverProvidersOf(input.takeover)
  return configured === null
    ? identified
    : identified.filter((provider) => configured.includes(provider))
}

function modelCompatFor(profile: PiAiProviderProfile, model: string | undefined): unknown {
  if (model === undefined) return undefined
  if (isRecord(profile.modelOverrides)) {
    const override = profile.modelOverrides[model]
    if (isRecord(override)) return override.compat
  }
  if (Array.isArray(profile.models)) {
    const row = profile.models.find((candidate) => isRecord(candidate) && candidate.id === model)
    if (isRecord(row)) return row.compat
  }
  return undefined
}

/** Project the shared provider/model config without retaining live settings objects. */
export function takeoverGatewayCompatInputs(
  section: PiAiSection | undefined,
  provider: string,
  model?: string,
): TakeoverGatewayCompatInputs {
  const profile = section?.providers?.[provider]
  if (!profile) return {}
  const modelCompat = modelCompatFor(profile, model)
  return {
    providerCompat: profile.compat,
    ...(modelCompat === undefined ? {} : { modelCompat }),
  }
}

/** The unique provider predicate defined by the takeover settings contract. */
export function isProviderTakenOver(section: TakeoverSection | undefined, provider: string): boolean {
  return takeoverProvidersOf(section)?.includes(provider) === true
}
