/**
 * Host-side execution of the plugin's own context-compaction percentages.
 *
 * The plugin owns only the POLICY (when to compact, how much tail to keep); the
 * summarization itself stays with the official backend. In the shipped Web
 * profile that backend is `@deepseek-ai/dsh-compaction-basic`, mounted inside
 * each agent preset's `isolate` realm, so `ctx.get('compaction')` is `undefined`
 * on the host plane. The live instance is reachable only through
 * `ctx.get('agentPresets').serviceFor(agent, 'compaction')` — hence every
 * service here is read dynamically and `undefined` means "this deployment does
 * not compose that capability", never an error.
 *
 * Why nothing here imports the official packages, not even for types:
 *
 * - `@deepseek-ai/dsh-compaction`, `dsh-token-meter`, `dsh-tools` and
 *   `dsh-agent` are NOT dependencies of this plugin, so `tsc` cannot resolve
 *   them while building this workspace (a type-only import still needs the
 *   module to resolve). A static import would break `pnpm run build`.
 * - The installed profile CAN resolve them at runtime, but a build-time import
 *   of a package that is not in `dependencies` is a packaging bug regardless of
 *   whether it happens to resolve on one machine.
 *
 * So the shapes crossing this seam are declared locally, minimally, and validated
 * with `isUnknownRecord` before any member is read. `toolPairingBalancedBefore`
 * is likewise re-implemented here (see {@link balanceCuts}) instead of imported.
 *
 * A model-facing `compact_context` tool is deliberately NOT part of this
 * release. `defineTool` lives in `@deepseek-ai/dsh-tools`, which is not a
 * dependency, so the tool would have to hand-write the raw `ToolDefinition`
 * shape `tools.register()` validates (`name`, `parameters`, mandatory
 * `output { schema, render }`, `execute`) — surface area with no way to verify
 * it against the real validator from this workspace. `compactRegion` itself
 * would work from a tool (a tool runs inside a step, so a turn is open, exactly
 * as in the pre-step path), so a later release can add the tool here without
 * changing {@link compactSessionRegion}.
 */

import { LOG_PREFIX, PLUGIN_ENTRY_ID } from '@hytime/dsh-plugin-kit'
import { compactionPolicyFrom, policyForModel, retainTokens, thresholdTokens } from '@hytime/dsh-plugin-kit'
import type { CompactionPolicySettings } from '@hytime/dsh-plugin-kit'
import { isUnknownRecord } from '@hytime/dsh-plugin-kit'
import { readSettingsSection, settingsEntryId } from '@hytime/dsh-plugin-kit'
import type { HostContext } from '@hytime/dsh-plugin-kit'

/** Cordis service names read through `ctx.get()`. */
const AGENT_PRESETS_SERVICE = 'agentPresets'
const COMPACTION_SERVICE = 'compaction'
const TOKEN_METER_SERVICE = 'tokenMeter'
const LLM_SERVICE = 'llm'

/** One priced node of the current session surface. */
export interface TokenSurfaceNode {
  readonly seq: unknown
  readonly tokens: number
}

/** The parts of a token-meter measurement the selection algorithm reads. */
export interface TokenMeasurement {
  readonly totalTokens: number
  readonly nodes: readonly TokenSurfaceNode[]
}

/** `ctx.tokenMeter` as this module uses it. */
export interface TokenMeterLike {
  measure(session: unknown): TokenMeasurement
}

/** `ctx.compaction` / the preset-scoped backend, reduced to the one method used. */
export interface CompactionBackend {
  compactRegion(start: unknown, end: unknown, agent: unknown, signal?: AbortSignal): Promise<unknown>
}

/** The parts of the official `CompactionResult` this plugin reports. */
export interface CompactionRegionResult {
  readonly shadowedSeqs?: readonly unknown[]
  readonly shadowedTokenCount?: number
}

/** Injected dependencies, so the selection/compaction path is testable without a host. */
export interface CompactionRegionDeps {
  readonly meter: TokenMeterLike
  readonly compaction: CompactionBackend
}

/** One resolved route the policy is priced against. */
interface Route {
  readonly provider: string
  readonly model: string
}

/** Everything the pressure pass needs after the cheap checks have passed. */
interface CompactionTarget {
  readonly session: Record<string, unknown>
  readonly backend: CompactionBackend
  readonly meter: TokenMeterLike
  readonly threshold: number
  readonly retainBudget: number
}

function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A non-empty string, or `undefined` so an empty route half cannot win a fallback. */
function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * The pre-step payload's cancellation signal.
 *
 * The payload is untrusted by contract, so the signal is identified structurally:
 * `aborted` is the one member every `AbortSignal` exposes and no ordinary
 * payload value does.
 */
function signalOf(value: unknown): AbortSignal | undefined {
  if (!isUnknownRecord(value)) return undefined
  const candidate = value.signal
  return typeof (candidate as { aborted?: unknown } | undefined)?.aborted === 'boolean'
    ? candidate as AbortSignal
    : undefined
}

/**
 * The plugin's own compaction policy, read from the section that stores it.
 *
 * A missing section, a legacy host without `describe()`, or a document written
 * before the field existed all resolve to the schema defaults (`enabled: false`),
 * which is the safe answer: the plugin stays out of the way rather than guessing.
 */
function policyOf(ctx: HostContext): CompactionPolicySettings {
  const section = readSettingsSection(ctx.settings, settingsEntryId(ctx, PLUGIN_ENTRY_ID))
  return compactionPolicyFrom(isUnknownRecord(section) ? section.compaction : undefined)
}

/** The token meter, when this deployment composes one on the host plane. */
function meterOf(ctx: HostContext): TokenMeterLike | undefined {
  const meter = ctx.get?.(TOKEN_METER_SERVICE)
  if (!isUnknownRecord(meter) || typeof meter.measure !== 'function') return undefined
  return meter as unknown as TokenMeterLike
}

/** The LLM seam used to price the routed model's window. */
function llmOf(ctx: HostContext): { resolveModelInfo: (provider: string, model: string, signal?: AbortSignal) => Promise<unknown> } | undefined {
  const llm = ctx.get?.(LLM_SERVICE)
  if (!isUnknownRecord(llm) || typeof llm.resolveModelInfo !== 'function') return undefined
  return llm as unknown as { resolveModelInfo: (provider: string, model: string, signal?: AbortSignal) => Promise<unknown> }
}

/**
 * The compaction backend serving one agent.
 *
 * The preset registry is consulted first because the official backend lives in
 * the agent's isolated preset realm; `ctx.get('compaction')` is only the
 * fallback for a deployment that mounts one backend on the host plane. A
 * registry that answers nothing for this agent — no preset binding, or a bound
 * preset that does not mount a compaction row — falls through to that fallback
 * rather than failing the turn.
 */
function backendOf(ctx: HostContext, agent: Record<string, unknown>): CompactionBackend | undefined {
  const presets = ctx.get?.(AGENT_PRESETS_SERVICE)
  if (isUnknownRecord(presets) && typeof presets.serviceFor === 'function') {
    try {
      const scoped = Reflect.apply(presets.serviceFor, presets, [agent, COMPACTION_SERVICE])
      if (isUnknownRecord(scoped) && typeof scoped.compactRegion === 'function') {
        return scoped as unknown as CompactionBackend
      }
    } catch {
      // No preset binding for this agent: the host-plane fallback below is the next place to look.
    }
  }
  const host = ctx.get?.(COMPACTION_SERVICE)
  if (isUnknownRecord(host) && typeof host.compactRegion === 'function') {
    return host as unknown as CompactionBackend
  }
  return undefined
}

/** The `config` of the session's latest routed request, when one was logged. */
function requestConfigOf(session: Record<string, unknown>): Record<string, unknown> | undefined {
  const requestHeader = session.requestHeader
  if (typeof requestHeader !== 'function') return undefined
  const header = Reflect.apply(requestHeader, session, [])
  if (!isUnknownRecord(header)) return undefined
  return isUnknownRecord(header.config) ? header.config : undefined
}

/**
 * The route the policy is priced against.
 *
 * The logged request header wins because it is what the provider actually
 * charges; `agent.options` only supplies the fallback for a session that has not
 * made its first request yet. Empty strings count as absent, matching the
 * official backend's "unrouted" spelling.
 */
function routeOf(session: Record<string, unknown>, options: unknown): Route | undefined {
  const config = requestConfigOf(session)
  const optionRecord = isUnknownRecord(options) ? options : undefined
  const provider = nonEmptyString(config?.provider) ?? nonEmptyString(optionRecord?.provider)
  const model = nonEmptyString(config?.model) ?? nonEmptyString(optionRecord?.model)
  return provider === undefined || model === undefined ? undefined : { provider, model }
}

/** The routed adapter's declared combined capacity, or `undefined` when it declares none. */
async function contextWindowOf(
  llm: { resolveModelInfo: (provider: string, model: string, signal?: AbortSignal) => Promise<unknown> },
  route: Route,
  signal: AbortSignal | undefined,
): Promise<number | undefined> {
  const info = await llm.resolveModelInfo(route.provider, route.model, signal)
  if (!isUnknownRecord(info) || !isUnknownRecord(info.context)) return undefined
  const contextWindow = info.context.contextWindow
  return typeof contextWindow === 'number' && Number.isInteger(contextWindow) && contextWindow > 0
    ? contextWindow
    : undefined
}

/** One measurement, narrowed to the shape {@link selectCompactableRange} relies on. */
function measurementOf(meter: TokenMeterLike, session: Record<string, unknown>): TokenMeasurement | undefined {
  const measured: unknown = meter.measure(session)
  if (!isUnknownRecord(measured) || !Array.isArray(measured.nodes)) return undefined
  const nodes: TokenSurfaceNode[] = []
  for (const node of measured.nodes) {
    if (!isUnknownRecord(node) || typeof node.tokens !== 'number') return undefined
    nodes.push({ seq: node.seq, tokens: node.tokens })
  }
  const totalTokens = typeof measured.totalTokens === 'number' ? measured.totalTokens : 0
  return { totalTokens, nodes }
}

/**
 * Price one agent's next compaction from the policy, or `undefined` when this
 * deployment cannot answer every question the pass needs (no backend, no meter,
 * no LLM seam, no declared window, unrouted session).
 */
async function targetOf(
  ctx: HostContext,
  agent: Record<string, unknown>,
  signal: AbortSignal | undefined,
  policy: CompactionPolicySettings,
): Promise<CompactionTarget | undefined> {
  const session = isUnknownRecord(agent.session) ? agent.session : undefined
  if (session === undefined) return undefined
  const backend = backendOf(ctx, agent)
  if (backend === undefined) return undefined
  const meter = meterOf(ctx)
  if (meter === undefined) return undefined
  const route = routeOf(session, agent.options)
  if (route === undefined) return undefined
  const llm = llmOf(ctx)
  if (llm === undefined) return undefined
  const contextWindow = await contextWindowOf(llm, route, signal)
  if (contextWindow === undefined) return undefined
  const ratios = policyForModel(policy, route.provider, route.model)
  return {
    session,
    backend,
    meter,
    threshold: thresholdTokens(contextWindow, ratios.thresholdRatio),
    retainBudget: retainTokens(contextWindow, ratios.retainRatio),
  }
}

/** The `system/message` event holding surface node 0, when the surface starts with one. */
function hasSystemHead(session: Record<string, unknown>, seq: unknown): boolean {
  const eventAt = session.eventAt
  if (typeof eventAt !== 'function') return false
  const head = Reflect.apply(eventAt, session, [seq])
  return isUnknownRecord(head) && head.type === 'system/message'
}

/** How one surface event moves the in-progress tool-call count. */
function toolCallDelta(event: unknown): number {
  if (!isUnknownRecord(event)) return 0
  if (event.type === 'tool/result') return -1
  if (event.type !== 'assistant/message' || !isUnknownRecord(event.data)) return 0
  const message = event.data.message
  if (!isUnknownRecord(message) || !Array.isArray(message.content)) return 0
  let calls = 0
  for (const block of message.content) {
    if (isUnknownRecord(block) && block.type === 'tool-call') calls += 1
  }
  return calls
}

/**
 * Tool-pairing balance of every cut in the current surface.
 *
 * Entry `i` is the cut immediately BEFORE surface node `i`, and the last entry is
 * the cut after the tail. This mirrors `toolPairingBalancedBefore` from
 * `@deepseek-ai/dsh-compaction`, which this module cannot import (see the file
 * header). It is computed once per selection rather than cached per session: the
 * module makes exactly one call per turn, so a cache would add invalidation state
 * (surface replacements change every position) without saving measurable work.
 *
 * A negative in-progress count means a `tool/result` had no preceding call, i.e.
 * the surface is corrupt; the caller treats that as a failed selection instead of
 * cutting an unsafe range.
 *
 * @param session - session supplying the log behind the current surface.
 * @param seqs - surface node seqs in positional order.
 * @returns one balance flag per cut, length `seqs.length + 1`.
 */
function balanceCuts(session: Record<string, unknown>, seqs: readonly unknown[]): readonly boolean[] {
  const eventAt = session.eventAt
  if (typeof eventAt !== 'function') {
    throw new Error('compaction: session.eventAt is unavailable, cannot verify tool-pairing balance')
  }
  const cuts: boolean[] = [true]
  let inProgress = 0
  for (const seq of seqs) {
    inProgress += toolCallDelta(Reflect.apply(eventAt, session, [seq]))
    if (inProgress < 0) {
      throw new Error('compaction: tool/result without an open tool call; the session surface is corrupt')
    }
    cuts.push(inProgress === 0)
  }
  return cuts
}

/**
 * Select the inclusive surface span one compaction may replace.
 *
 * The algorithm is `selectCompactableRange` from `dsh-compaction-basic`, copied
 * rather than imported because that package's export map exposes only its root
 * and this function is not re-exported. It keeps the newest surface tail whose
 * price reaches `retainBudget` verbatim, then walks the cut backwards until it no
 * longer splits an assistant tool call from its result. `system/message` at node 0
 * is never compacted, matching the official backend.
 *
 * @param session - session supplying the authoritative surface and its events.
 * @param measurement - priced surface from the conversation meter.
 * @param retainBudget - minimum recent-tail tokens kept verbatim.
 * @returns the inclusive positional seq range, or `null` when nothing is safe.
 */
function selectCompactableRange(
  session: Record<string, unknown>,
  measurement: TokenMeasurement,
  retainBudget: number,
): { readonly start: unknown; readonly end: unknown } | null {
  const nodes = measurement.nodes
  if (nodes.length === 0) return null
  const surface = session.surface
  const seqs = isUnknownRecord(surface) && Array.isArray(surface.nodes) ? surface.nodes : undefined
  if (seqs === undefined) return null
  if (seqs.length !== nodes.length || nodes.some((node, index) => node.seq !== seqs[index])) {
    throw new Error('compaction: token-meter surface does not match the current session surface')
  }
  const firstIdx = hasSystemHead(session, seqs[0]) ? 1 : 0
  const cuts = balanceCuts(session, seqs)

  let accumulated = 0
  let keepFromIdx = nodes.length
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    accumulated += nodes[index].tokens
    keepFromIdx = index
    if (accumulated >= retainBudget) break
  }
  if (keepFromIdx <= firstIdx) return null

  while (keepFromIdx > firstIdx && cuts[keepFromIdx] !== true) keepFromIdx -= 1
  if (keepFromIdx <= firstIdx) return null

  return { start: seqs[firstIdx], end: seqs[keepFromIdx - 1] }
}

/**
 * Compact one safely selected region of `agent`'s current surface.
 *
 * The caller owns the open-turn guarantee: `compactRegion` throws unless a turn is
 * open, which holds for a pre-step listener and for a tool running inside a step,
 * but NOT for an idle session — that path must use the official `compactNow`,
 * which this plugin deliberately does not call (it goes through
 * `agent.runMaintenance` and throws `busy` synchronously during a turn).
 *
 * @param deps - token meter and the compaction backend for this agent.
 * @param agent - agent whose session is compacted; also names the route to summarize under.
 * @param retainBudget - minimum recent-tail tokens kept verbatim.
 * @param signal - cancellation for the summarization call.
 * @returns the backend's result, or `null` when no safe range exists or the
 * measurement is unusable.
 * @throws when the surface and the measurement disagree, which means a caller
 * measured a different surface generation and must not cut anything.
 */
export async function compactSessionRegion(
  deps: CompactionRegionDeps,
  agent: unknown,
  retainBudget: number,
  signal?: AbortSignal,
): Promise<CompactionRegionResult | null> {
  if (!isUnknownRecord(agent) || !isUnknownRecord(agent.session)) return null
  const measurement = measurementOf(deps.meter, agent.session)
  if (measurement === undefined) return null
  return compactMeasuredRegion(deps, agent, agent.session, measurement, retainBudget, signal)
}

/**
 * {@link compactSessionRegion} over an already-taken measurement.
 *
 * The pressure path measures once to decide `totalTokens >= threshold` and then
 * needs the same snapshot for selection; taking it again would double the only
 * O(surface) cost in the pass and could in principle select against a newer
 * generation than the one that triggered.
 */
async function compactMeasuredRegion(
  deps: CompactionRegionDeps,
  agent: unknown,
  session: Record<string, unknown>,
  measurement: TokenMeasurement,
  retainBudget: number,
  signal?: AbortSignal,
): Promise<CompactionRegionResult | null> {
  const range = selectCompactableRange(session, measurement, retainBudget)
  if (range === null) return null
  const result = await deps.compaction.compactRegion(range.start, range.end, agent, signal)
  return isUnknownRecord(result) ? result as CompactionRegionResult : {}
}

/** One log line for a completed compaction, tolerant of a backend result that omits fields. */
function describeResult(result: CompactionRegionResult): string {
  const nodes = Array.isArray(result.shadowedSeqs) ? result.shadowedSeqs.length : 0
  const tokens = typeof result.shadowedTokenCount === 'number' ? result.shadowedTokenCount : 0
  return `shadowed ${nodes} surface node(s) (~${tokens} tokens)`
}

/**
 * Compact when the current surface is above the policy's threshold.
 *
 * Every failure here is absorbed: a compaction problem must never break the
 * conversation turn it happens in, and the official backend runs its own
 * pressure pass immediately after this one with a surface that is either already
 * under its higher threshold or still a valid target for it.
 */
async function compactOnPressure(ctx: HostContext, payload: unknown): Promise<void> {
  const policy = policyOf(ctx)
  if (!policy.enabled) return
  if (!isUnknownRecord(payload) || !isUnknownRecord(payload.agent)) return
  const agent = payload.agent
  const target = await targetOf(ctx, agent, signalOf(payload), policy)
  if (target === undefined) return
  const measurement = measurementOf(target.meter, target.session)
  if (measurement === undefined) return
  if (measurement.totalTokens < target.threshold) return
  const result = await compactMeasuredRegion(
    { meter: target.meter, compaction: target.backend },
    agent,
    target.session,
    measurement,
    target.retainBudget,
    signalOf(payload),
  )
  if (result === null) {
    log('compaction policy: above threshold but no safe range to compact')
    return
  }
  log(`compaction policy: ${describeResult(result)}`)
}

/**
 * The `agent/pre-step` waterfall listener.
 *
 * The decision is always forwarded to `next()`, whether or not this pass did any
 * work, so a later listener (including the official backend's) still runs.
 */
async function handlePreStep(ctx: HostContext, payload: unknown, next: unknown): Promise<unknown> {
  try {
    await compactOnPressure(ctx, payload)
  } catch (error) {
    log('compaction policy error:', messageOf(error))
  }
  return typeof next === 'function' ? Reflect.apply(next, undefined, []) : undefined
}

/**
 * Install the plugin's own pressure-based compaction policy.
 *
 * The listener is a plain host-plane `agent/pre-step` handler: an unscoped
 * listener receives every agent's pre-step (scope filtering only admits a tag-less
 * listener), so no per-agent installation is needed. `global: true` matches the
 * plugin's other host listeners and keeps it independent of the calling fiber's
 * scope.
 */
export function installCompactionPolicy(ctx: HostContext): void {
  ctx.effect(() => {
    const disposer = ctx.on(
      'agent/pre-step',
      (...args: unknown[]) => handlePreStep(ctx, args[0], args[1]),
      { global: true },
    )
    return typeof disposer === 'function' ? disposer as () => void : undefined
  }, `${LOG_PREFIX}: compaction policy`)
}

