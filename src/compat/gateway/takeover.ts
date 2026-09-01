/** Read-only interoperability helpers for the optional OpenAI-completions takeover. */

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
  readonly [key: string]: unknown
}

export interface PiAiSection {
  readonly providers?: Record<string, PiAiProviderProfile>
}

export interface TakeoverSection {
  readonly enabled?: unknown
  readonly providers?: unknown
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
  if (profile === undefined) return false
  if (profile.api === 'openai-completions') return true
  if (typeof profile.baseURL !== 'string' || profile.baseURL.length === 0) return false
  try {
    return !OFFICIAL_HOST_RE.test(new URL(profile.baseURL).hostname)
  } catch {
    return false
  }
}

/** Whether any shared llm-pi-ai model declares thinking capability. */
export function declaresThinking(profile: PiAiProviderProfile | undefined): boolean {
  return modelRows(profile).some((model) => isEffortsTable(model.reasoningEfforts))
}

/** Identify custom thinking routes without changing either settings namespace. */
export function identifyTakeoverProviders(section: PiAiSection | undefined): string[] {
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

/** The unique provider predicate defined by the takeover settings contract. */
export function isProviderTakenOver(section: TakeoverSection | undefined, provider: string): boolean {
  return takeoverProvidersOf(section)?.includes(provider) === true
}
