import { describe, expect, it, vi } from 'vitest'

import { compactSessionRegion, installCompactionPolicy } from '@hytime/dsh-feature-compaction'
import type { HostContext } from '@hytime/dsh-plugin-kit'
import { PLUGIN_ENTRY_ID } from '@hytime/dsh-plugin-kit'

/**
 * The pre-step decision this harness's `next()` resolves to, so a test can also
 * prove the listener forwards the chain's answer unchanged instead of replacing
 * it with its own.
 */
const FORWARDED = { kind: 'continue' } as const

/** One fake session surface plus the log events behind it. */
interface FakeSession {
  readonly session: Record<string, unknown>
  readonly seqs: readonly number[]
}

type EventSpec = { readonly type: string; readonly toolCalls?: number }

/**
 * Build a session whose surface nodes are `seqs`, each resolving through
 * `eventAt` to the event described at the same index.
 *
 * The events are the only thing the tool-pairing fold reads, so a test states the
 * conversation shape it cares about rather than building real session events.
 */
function fakeSession(seqs: readonly number[], events: readonly EventSpec[], route?: { provider: string; model: string }): FakeSession {
  const bySeq = new Map<number, Record<string, unknown>>()
  seqs.forEach((seq, index) => {
    const spec = events[index] ?? { type: 'user/message' }
    if (spec.type === 'assistant/message') {
      bySeq.set(seq, {
        type: spec.type,
        data: { message: { content: Array.from({ length: spec.toolCalls ?? 0 }, () => ({ type: 'tool-call' })) } },
      })
      return
    }
    bySeq.set(seq, { type: spec.type })
  })
  const session: Record<string, unknown> = {
    surface: { nodes: [...seqs] },
    eventAt: (seq: unknown) => bySeq.get(seq as number),
  }
  if (route !== undefined) {
    session.requestHeader = () => ({ config: { provider: route.provider, model: route.model } })
  }
  return { session, seqs }
}

/** A token-meter stand-in returning one price per surface node. */
function fakeMeter(seqs: readonly number[], tokens: readonly number[], totalTokens?: number) {
  return {
    measure: vi.fn(() => ({
      totalTokens: totalTokens ?? tokens.reduce((sum, value) => sum + value, 0),
      nodes: seqs.map((seq, index) => ({ seq, tokens: tokens[index] ?? 0 })),
    })),
  }
}

/** A compaction backend stand-in recording the span it was asked to replace. */
function fakeCompaction() {
  const compactRegion = vi.fn(async () => ({
    shadowedSeqs: ['result'],
    shadowedTokenCount: 1,
  }))
  return { compactRegion }
}

/** An LLM seam stand-in declaring one context window for every route. */
function fakeLlm(contextWindow: number) {
  return { resolveModelInfo: vi.fn(async () => ({ context: { contextWindow } })) }
}

interface FakeHostOptions {
  /** The stored `compaction` field of the plugin's own settings section. */
  readonly compaction?: Record<string, unknown>
  /** Services reachable through `ctx.get(name)`. */
  readonly services?: Record<string, unknown>
}

interface Harness {
  readonly ctx: HostContext
  /** Fire the installed pre-step listener and report what the chain observed. */
  readonly preStep: (payload: unknown) => Promise<{ readonly nextCalls: number; readonly result: unknown }>
}

/**
 * Install the policy against a context object whose services are the caller's
 * fakes, so no Cordis runtime or real DSH process is involved.
 *
 * `effect` runs its callback immediately and `on` records the listener; that is
 * enough, because what the plugin does with a service is the behavior under test,
 * not Cordis' own scheduling.
 */
function fakeHost(options: FakeHostOptions = {}): Harness {
  const listeners = new Map<string, (...args: unknown[]) => unknown>()
  const ctx = {
    settings: {
      update: () => undefined,
      describe: () => [{ ns: PLUGIN_ENTRY_ID, value: { compaction: options.compaction ?? {} } }],
    },
    get: (name: string) => options.services?.[name],
    timeout: () => undefined,
    effect: (callback: () => void | (() => void)) => callback(),
    on: (event: string, callback: (...args: unknown[]) => unknown) => {
      listeners.set(event, callback)
      return () => {}
    },
  } as unknown as HostContext
  installCompactionPolicy(ctx)
  return {
    ctx,
    async preStep(payload: unknown) {
      const listener = listeners.get('agent/pre-step')
      expect(listener).toBeTypeOf('function')
      let nextCalls = 0
      const result = await listener?.(payload, () => {
        nextCalls += 1
        return Promise.resolve(FORWARDED)
      })
      return { nextCalls, result }
    },
  }
}

/** The payload shape the agent loop dispatches to `agent/pre-step`. */
function preStepPayload(agent: Record<string, unknown>, signal = new AbortController().signal): Record<string, unknown> {
  return { agent, signal }
}

/** The four surface events of one ordinary tool round trip plus a system head. */
const TOOL_ROUND_TRIP: readonly EventSpec[] = [
  { type: 'system/message' },
  { type: 'user/message' },
  { type: 'assistant/message', toolCalls: 1 },
  { type: 'tool/result' },
  { type: 'assistant/message' },
]

describe('installCompactionPolicy', () => {
  it('does nothing when the policy is disabled, and still forwards the decision', async () => {
    const { session, seqs } = fakeSession([1, 2, 3, 4, 5], TOOL_ROUND_TRIP, { provider: 'p', model: 'm' })
    const meter = fakeMeter(seqs, [100, 100, 100, 100, 100])
    const compaction = fakeCompaction()
    const host = fakeHost({
      compaction: { enabled: false, thresholdRatio: 0.6, retainRatio: 0.16 },
      services: {
        agentPresets: { serviceFor: () => compaction },
        tokenMeter: meter,
        llm: fakeLlm(600),
      },
    })

    const observed = await host.preStep(preStepPayload({ session, options: {} }))

    expect(observed.nextCalls).toBe(1)
    expect(observed.result).toBe(FORWARDED)
    expect(meter.measure).not.toHaveBeenCalled()
    expect(compaction.compactRegion).not.toHaveBeenCalled()
  })

  it('does nothing while the surface is below the threshold', async () => {
    const { session, seqs } = fakeSession([1, 2, 3, 4, 5], TOOL_ROUND_TRIP, { provider: 'p', model: 'm' })
    // 500 measured against a 1000-token window at 60%: the threshold is 600.
    const meter = fakeMeter(seqs, [100, 100, 100, 100, 100])
    const compaction = fakeCompaction()
    const host = fakeHost({
      compaction: { enabled: true, thresholdRatio: 0.6, retainRatio: 0.16 },
      services: { agentPresets: { serviceFor: () => compaction }, tokenMeter: meter, llm: fakeLlm(1000) },
    })

    const observed = await host.preStep(preStepPayload({ session, options: {} }))

    expect(observed.nextCalls).toBe(1)
    expect(meter.measure).toHaveBeenCalledTimes(1)
    expect(compaction.compactRegion).not.toHaveBeenCalled()
  })

  it('compacts the span that keeps the retained tail and skips the system head', async () => {
    const { session, seqs } = fakeSession([1, 2, 3, 4, 5], TOOL_ROUND_TRIP, { provider: 'p', model: 'm' })
    // Window 600 at 60% compacts at 360 and keeps 96 tokens (16%) verbatim: the
    // single newest node is enough tail, so nodes 2..4 become the span.
    const meter = fakeMeter(seqs, [100, 100, 100, 100, 100])
    const compaction = fakeCompaction()
    const signal = new AbortController().signal
    const host = fakeHost({
      compaction: { enabled: true, thresholdRatio: 0.6, retainRatio: 0.16 },
      services: { agentPresets: { serviceFor: () => compaction }, tokenMeter: meter, llm: fakeLlm(600) },
    })
    const agent = { session, options: {} }

    const observed = await host.preStep(preStepPayload(agent, signal))

    expect(observed.nextCalls).toBe(1)
    expect(compaction.compactRegion).toHaveBeenCalledTimes(1)
    // Start is surface node 1 (after the system head); end is the node before the
    // retained tail, and the cut there is tool-pairing balanced.
    expect(compaction.compactRegion).toHaveBeenCalledWith(2, 4, agent, signal)
  })

  it('walks the cut backwards so it never splits a tool call from its result', async () => {
    // Two round trips; a 100-token tail budget would cut between the second
    // assistant tool-call (cut before node 5 is unbalanced) and its result.
    const events: readonly EventSpec[] = [
      { type: 'system/message' },
      { type: 'user/message' },
      { type: 'assistant/message', toolCalls: 1 },
      { type: 'tool/result' },
      { type: 'assistant/message', toolCalls: 1 },
      { type: 'tool/result' },
    ]
    const { session, seqs } = fakeSession([1, 2, 3, 4, 5, 6], events, { provider: 'p', model: 'm' })
    const compaction = fakeCompaction()
    const host = fakeHost({
      // 625 * 0.16 = 100 tokens retained, so the naive cut sits at node index 5.
      compaction: { enabled: true, thresholdRatio: 0.6, retainRatio: 0.16 },
      services: {
        agentPresets: { serviceFor: () => compaction },
        tokenMeter: fakeMeter(seqs, [100, 100, 100, 100, 100, 100]),
        llm: fakeLlm(625),
      },
    })

    await host.preStep(preStepPayload({ session, options: {} }))

    // Walked back from index 5 to index 4 (the cut after the first round trip).
    expect(compaction.compactRegion).toHaveBeenCalledWith(2, 4, expect.anything(), expect.anything())
  })

  it('degrades silently when no compaction backend is reachable', async () => {
    const { session, seqs } = fakeSession([1, 2, 3, 4, 5], TOOL_ROUND_TRIP, { provider: 'p', model: 'm' })
    const meter = fakeMeter(seqs, [100, 100, 100, 100, 100])
    const host = fakeHost({
      compaction: { enabled: true },
      // The preset registry exists but has no backend for this agent, and the
      // host plane mounts none either: the exact Web-profile situation.
      services: { agentPresets: { serviceFor: () => undefined }, tokenMeter: meter, llm: fakeLlm(600) },
    })

    const observed = await host.preStep(preStepPayload({ session, options: {} }))

    expect(observed.nextCalls).toBe(1)
    expect(meter.measure).not.toHaveBeenCalled()
  })

  it('falls back to the host-plane compaction service when no preset registry exists', async () => {
    const { session, seqs } = fakeSession([1, 2, 3, 4, 5], TOOL_ROUND_TRIP, { provider: 'p', model: 'm' })
    const compaction = fakeCompaction()
    const host = fakeHost({
      compaction: { enabled: true, thresholdRatio: 0.6, retainRatio: 0.16 },
      services: { compaction, tokenMeter: fakeMeter(seqs, [100, 100, 100, 100, 100]), llm: fakeLlm(600) },
    })

    await host.preStep(preStepPayload({ session, options: {} }))

    expect(compaction.compactRegion).toHaveBeenCalledTimes(1)
  })

  it('falls back to the agent options route when the session logged no request', async () => {
    const { session, seqs } = fakeSession([1, 2, 3, 4, 5], TOOL_ROUND_TRIP)
    const llm = fakeLlm(600)
    const compaction = fakeCompaction()
    const host = fakeHost({
      compaction: { enabled: true, thresholdRatio: 0.6, retainRatio: 0.16 },
      services: { agentPresets: { serviceFor: () => compaction }, tokenMeter: fakeMeter(seqs, [100, 100, 100, 100, 100]), llm },
    })

    await host.preStep(preStepPayload({ session, options: { provider: 'fallback', model: 'fallback-model' } }))

    expect(llm.resolveModelInfo).toHaveBeenCalledWith('fallback', 'fallback-model', expect.anything())
    expect(compaction.compactRegion).toHaveBeenCalledTimes(1)
  })

  it('absorbs a backend failure instead of breaking the turn', async () => {
    const { session, seqs } = fakeSession([1, 2, 3, 4, 5], TOOL_ROUND_TRIP, { provider: 'p', model: 'm' })
    const compaction = { compactRegion: vi.fn(async () => { throw new Error('summarizer exploded') }) }
    const host = fakeHost({
      compaction: { enabled: true, thresholdRatio: 0.6, retainRatio: 0.16 },
      services: { agentPresets: { serviceFor: () => compaction }, tokenMeter: fakeMeter(seqs, [100, 100, 100, 100, 100]), llm: fakeLlm(600) },
    })

    const observed = await host.preStep(preStepPayload({ session, options: {} }))

    expect(observed.nextCalls).toBe(1)
    expect(observed.result).toBe(FORWARDED)
  })

  it('absorbs a measurement that disagrees with the current surface', async () => {
    const { session, seqs } = fakeSession([1, 2, 3, 4, 5], TOOL_ROUND_TRIP, { provider: 'p', model: 'm' })
    // Prices name a node that is not on the surface: a stale generation.
    const meter = { measure: vi.fn(() => ({ totalTokens: 900, nodes: [{ seq: 99, tokens: 900 }] })) }
    const compaction = fakeCompaction()
    const host = fakeHost({
      compaction: { enabled: true, thresholdRatio: 0.6, retainRatio: 0.16 },
      services: { agentPresets: { serviceFor: () => compaction }, tokenMeter: meter, llm: fakeLlm(600) },
    })

    const observed = await host.preStep(preStepPayload({ session, options: {} }))

    expect(observed.nextCalls).toBe(1)
    expect(compaction.compactRegion).not.toHaveBeenCalled()
    expect(seqs).toHaveLength(5)
  })

  it('does nothing on a host that composes none of the services', async () => {
    const { session } = fakeSession([1, 2], [{ type: 'system/message' }, { type: 'user/message' }])
    const host = fakeHost({ compaction: { enabled: true } })

    const observed = await host.preStep(preStepPayload({ session, options: {} }))

    expect(observed.nextCalls).toBe(1)
    expect(observed.result).toBe(FORWARDED)
  })

  it('does nothing when the payload carries no agent', async () => {
    const host = fakeHost({ compaction: { enabled: true } })

    const observed = await host.preStep({})

    expect(observed.nextCalls).toBe(1)
    expect(observed.result).toBe(FORWARDED)
  })
})

describe('compactSessionRegion', () => {
  it('compacts the selected span and reports the backend result', async () => {
    const { session, seqs } = fakeSession([1, 2, 3, 4, 5], TOOL_ROUND_TRIP, { provider: 'p', model: 'm' })
    const compaction = fakeCompaction()
    const agent = { session, options: {} }

    const result = await compactSessionRegion(
      { meter: fakeMeter(seqs, [100, 100, 100, 100, 100]), compaction },
      agent,
      96,
    )

    expect(compaction.compactRegion).toHaveBeenCalledWith(2, 4, agent, undefined)
    expect(result).toEqual({ shadowedSeqs: ['result'], shadowedTokenCount: 1 })
  })

  it('returns null when the whole surface already fits the retained tail', async () => {
    const { session, seqs } = fakeSession([1, 2], [{ type: 'system/message' }, { type: 'user/message' }])
    const compaction = fakeCompaction()

    const result = await compactSessionRegion(
      { meter: fakeMeter(seqs, [100, 100]), compaction },
      { session, options: {} },
      1_000_000,
    )

    expect(result).toBeNull()
    expect(compaction.compactRegion).not.toHaveBeenCalled()
  })

  it('returns null for an agent whose payload carries no session', async () => {
    const compaction = fakeCompaction()

    const result = await compactSessionRegion(
      { meter: { measure: vi.fn(() => ({ totalTokens: 0, nodes: [] })) }, compaction },
      { options: {} },
      100,
    )

    expect(result).toBeNull()
    expect(compaction.compactRegion).not.toHaveBeenCalled()
  })
})
