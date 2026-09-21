import { createHash } from 'node:crypto'
import {
  evaluateNode,
  ExpressionParser,
  tokenize,
} from '../compat/opencode-expression.js'
import type { Node } from '../compat/opencode-expression.js'
import { stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import type {
  OpenCodeSessionFormatMode,
  OpenCodeSessionFormatSettings,
  OpenCodeSessionInvalidPolicy,
  OpenCodeSessionTimeSource,
} from '../compat/opencode-session.js'

/**
 * The upstream format enforced by OpenCode Zen free tier, kept as the
 * documented default shape the `ses-derive` mode produces. Validation is only
 * applied when a user explicitly configures `validate`, so this constant is
 * informational rather than an enforced default check.
 */
export const OPENCODE_SESSION_DEFAULT_REGEX = '^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$'

const LOG_PREFIX = '[@hytime/dsh-thinking-effort]'
const SHA256_SEED = 'dsh-thinking-effort/opencode-session'
const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const DSH_SESSION_PREFIX = 'session-'
const CACHE_MAX_ENTRIES = 4096
const SCRIPT_STAT_MIN_INTERVAL_MS = 1000
const FORMAT_MODES: readonly OpenCodeSessionFormatMode[] = ['ses-derive', 'passthrough', 'template', 'expression', 'script']
const TIME_SOURCES: readonly OpenCodeSessionTimeSource[] = ['firstUse', 'hash']
const INVALID_POLICIES: readonly OpenCodeSessionInvalidPolicy[] = ['warn', 'drop', 'send']

/** Context passed to template / expression / script modes and to the script export. */
export interface SessionFormatContext {
  readonly provider: string
  readonly model: string
  /** The raw session id exactly as the Host received it from `llm/stream`. */
  readonly rawSessionId: string
  /** The session id normalized for derivation (prefix stripped, lowercased, no hyphens). */
  readonly sessionId: string
  /** Current wall-clock milliseconds at evaluation time. */
  readonly now: number
  /** 12 hex characters: minted once per session (`firstUse`) or derived from the session digest (`hash`). */
  readonly hex12: string
  /** 14 Base62 characters derived deterministically from the session id. */
  readonly tail62: string
  /** Full lowercase SHA-256 hex of the normalized session id. */
  readonly sha256: string
}

export interface SessionFormatRequest {
  readonly provider: string
  readonly model: string
  readonly sessionId: string
}

/** The fully resolved generator configuration after defaults materialize. */
export interface ResolvedFormatConfig {
  readonly mode: OpenCodeSessionFormatMode
  readonly time: OpenCodeSessionTimeSource
  readonly template: string
  readonly expression: string
  readonly script: string
  readonly validateSource: string
  readonly validate: RegExp | undefined
  readonly onInvalid: OpenCodeSessionInvalidPolicy
}

export interface FormatterDeps {
  readonly now?: () => number
  readonly log?: (...args: unknown[]) => void
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function ownRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  const object = record(value)
  if (object === undefined || !Object.prototype.hasOwnProperty.call(object, key)) return undefined
  return record(object[key])
}

function stringValue(value: unknown, key: string): string | undefined {
  const object = record(value)
  if (object === undefined || !Object.prototype.hasOwnProperty.call(object, key)) return undefined
  const entry = object[key]
  return typeof entry === 'string' ? entry : undefined
}

/**
 * Resolve the `opencodeSession.format` config from a raw settings value
 * (the whole `dsh-thinking-effort` namespace). Unknown or malformed fields
 * fall back to the mode defaults documented for each field, so a hand-written
 * settings document never breaks header injection.
 */
export function resolveFormatConfig(settings: unknown): ResolvedFormatConfig {
  const raw = ownRecord(ownRecord(settings, 'opencodeSession'), 'format')

  const mode = FORMAT_MODES.includes(stringValue(raw, 'mode') as OpenCodeSessionFormatMode)
    ? stringValue(raw, 'mode') as OpenCodeSessionFormatMode
    : 'ses-derive'
  const time = TIME_SOURCES.includes(stringValue(raw, 'time') as OpenCodeSessionTimeSource)
    ? stringValue(raw, 'time') as OpenCodeSessionTimeSource
    : 'firstUse'
  const onInvalid = INVALID_POLICIES.includes(stringValue(raw, 'onInvalid') as OpenCodeSessionInvalidPolicy)
    ? stringValue(raw, 'onInvalid') as OpenCodeSessionInvalidPolicy
    : 'warn'
  const template = stringValue(raw, 'template') ?? ''
  const expression = stringValue(raw, 'expression') ?? ''
  const script = stringValue(raw, 'script') ?? ''
  const validateSource = stringValue(raw, 'validate') ?? ''

  let validate: RegExp | undefined
  if (validateSource.length > 0) {
    try {
      validate = new RegExp(validateSource)
    } catch {
      validate = undefined
    }
  }

  return { mode, time, template, expression, script, validateSource, validate, onInvalid }
}

function configFingerprint(config: ResolvedFormatConfig): string {
  return JSON.stringify([
    config.mode,
    config.time,
    config.template,
    config.expression,
    config.script,
    config.validateSource,
    config.onInvalid,
  ])
}

/**
 * Strip the `session-` prefix, hyphens and case so the same DSH session always
 * derives the same id. Note this intentionally also folds ids that only differ
 * in internal hyphen placement (`session-ab-cd` vs `session-a-bcd`); harmless
 * for the UUID-shaped ids DSH actually produces.
 */
export function normalizeSessionId(raw: string): string {
  let value = raw.trim()
  if (value.startsWith(DSH_SESSION_PREFIX)) value = value.slice(DSH_SESSION_PREFIX.length)
  value = value.replaceAll('-', '').toLowerCase()
  return value.length > 0 ? value : raw.trim()
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** 48-bit millisecond timestamp as exactly 12 lowercase hex characters. */
export function hexTime12(ms: number): string {
  return (BigInt(Math.max(0, Math.floor(ms))) & 0xffffffffffffn).toString(16).padStart(12, '0')
}

/** Deterministic 12-hex block derived from the session digest (`time: hash`). */
function hexTime12FromDigest(session: string): string {
  return sha256Hex(`${SHA256_SEED}/${session}`).slice(0, 12)
}

/** Deterministic 14-character Base62 block: 80 bits of the session digest. */
export function digestTail62(session: string): string {
  const hex = sha256Hex(`${SHA256_SEED}/${session}`)
  return encodeBase62(BigInt(`0x${hex.slice(0, 20)}`), 14)
}

function encodeBase62(value: bigint, length: number): string {
  let remaining = value
  const chars: string[] = new Array(length)
  for (let index = length - 1; index >= 0; index -= 1) {
    chars[index] = BASE62_ALPHABET[Number(remaining % 62n)]
    remaining /= 62n
  }
  return chars.join('')
}

type ScriptModule = { format: (context: SessionFormatContext) => unknown }

interface ScriptSlot {
  mtimeMs: number
  stamp: number
  module: ScriptModule | undefined
  loading: Promise<ScriptModule | undefined> | undefined
}

/**
 * The documented helper functions for `expression` mode. Built on a
 * null-prototype object so the inherited Object.prototype members are not even
 * present, and the evaluator additionally checks own-property ownership.
 */
const EXPRESSION_FUNCS: Record<string, (...args: unknown[]) => unknown> = Object.assign(Object.create(null), {
  sha256(value: unknown): string {
    return sha256Hex(String(value))
  },
  slice(value: unknown, start: unknown, end?: unknown): string {
    return String(value).slice(Number(start), end === undefined ? undefined : Number(end))
  },
  lower(value: unknown): string {
    return String(value).toLowerCase()
  },
  upper(value: unknown): string {
    return String(value).toUpperCase()
  },
})

function evaluateExpression(
  source: string,
  scope: object,
  funcs: Record<string, (...args: unknown[]) => unknown>,
): unknown {
  const parser = new ExpressionParser(tokenize(source))
  return evaluateNode(parser.parse(), scope, funcs)
}

function renderTemplate(template: string, context: SessionFormatContext): string {
  const entries: ReadonlyArray<readonly [string, string]> = [
    ['{rawSessionId}', context.rawSessionId],
    ['{sessionId}', context.sessionId],
    ['{hex12}', context.hex12],
    ['{tail62}', context.tail62],
    ['{sha256}', context.sha256],
    ['{now}', String(context.now)],
    ['{provider}', context.provider],
    ['{model}', context.model],
  ]
  let value = template
  for (const [placeholder, replacement] of entries) {
    value = value.replaceAll(placeholder, replacement)
  }
  return value
}

/**
 * Per-session generator; one instance per Host effect. The value cache is
 * bounded (LRU), while `minted` timestamps are intentionally retained for the
 * process lifetime so a session's value never changes once published.
 */
export class OpenCodeSessionFormatter {
  private readonly cache = new Map<string, { fingerprint: string; value: string | undefined }>()
  /**
   * First-use minted hex blocks. Eviction removes only the value-cache entry,
   * never the mint: dropping it would re-mint on the next request and change
   * the header value for the same DSH session, breaking per-session stability.
   * Entries are a dozen bytes per distinct session, so retention is bounded in
   * practice and preferred over a second eviction policy.
   */
  private readonly minted = new Map<string, string>()
  private readonly warned = new Set<string>()
  private readonly scripts = new Map<string, ScriptSlot>()
  private readonly now: () => number
  private readonly log: (...args: unknown[]) => void

  constructor(deps: FormatterDeps = {}) {
    this.now = deps.now ?? (() => Date.now())
    this.log = deps.log ?? ((...args: unknown[]) => console.log(LOG_PREFIX, ...args))
  }

  /**
   * Produce the header value for one session. The result is cached per
   * normalized session id and config fingerprint, so the same DSH session
   * always yields the same value while the config is unchanged. The `script`
   * mode resolves asynchronously; all other modes are synchronous.
   */
  format(
    request: SessionFormatRequest,
    config: ResolvedFormatConfig,
  ): string | undefined | Promise<string | undefined> {
    const session = normalizeSessionId(request.sessionId)
    const fingerprint = configFingerprint(config)
    const cached = this.cache.get(session)
    if (cached !== undefined && cached.fingerprint === fingerprint) {
      // Refresh recency without re-running the generator; see `storeAndReturn`.
      this.cache.delete(session)
      this.cache.set(session, cached)
      return cached.value
    }

    if (config.mode === 'script') {
      return this.computeScriptValue(request, session, config, fingerprint)
    }
    return this.storeAndReturn(session, fingerprint, this.computeValue(request, session, config))
  }

  /** Forget cached values and minted timestamps. Mainly for tests. */
  reset(): void {
    this.cache.clear()
    this.minted.clear()
    this.scripts.clear()
  }

  private computeValue(
    request: SessionFormatRequest,
    session: string,
    config: ResolvedFormatConfig,
  ): string | undefined {
    switch (config.mode) {
      case 'passthrough':
        return this.applyValidation(request.sessionId, config)
      case 'ses-derive':
        return this.applyValidation(this.derive(session, config.time), config)
      case 'template': {
        if (config.template.length === 0) {
          this.warnOnce('template mode requires a non-empty template; using ses-derive for this session')
          return this.applyValidation(this.derive(session, config.time), config)
        }
        return this.applyValidation(renderTemplate(config.template, this.context(request, session, config.time)), config)
      }
      case 'expression': {
        if (config.expression.length === 0) {
          this.warnOnce('expression mode requires a non-empty expression; using ses-derive for this session')
          return this.applyValidation(this.derive(session, config.time), config)
        }
        let value: string
        try {
          value = String(evaluateExpression(config.expression, this.context(request, session, config.time), EXPRESSION_FUNCS))
        } catch (error) {
          this.warnOnce(`expression error (${config.expression}); using ses-derive for this session: ${error instanceof Error ? error.message : String(error)}`)
          value = this.derive(session, config.time)
        }
        return this.applyValidation(value, config)
      }
      case 'script':
        return undefined
    }
  }

  private async computeScriptValue(
    request: SessionFormatRequest,
    session: string,
    config: ResolvedFormatConfig,
    fingerprint: string,
  ): Promise<string | undefined> {
    let value: string
    if (config.script.length === 0) {
      this.warnOnce('script mode requires a non-empty script path; using ses-derive for this session')
      value = this.derive(session, config.time)
    } else {
      const module = await this.loadScript(config.script)
      if (module === undefined) {
        this.warnOnce(`script failed to load (${config.script}); using ses-derive for this session`)
        value = this.derive(session, config.time)
      } else {
        try {
          const result = module.format(this.context(request, session, config.time))
          value = typeof result === 'string' ? result : String(result)
        } catch (error) {
          this.warnOnce(`script format error (${config.script}); using ses-derive: ${error instanceof Error ? error.message : String(error)}`)
          value = this.derive(session, config.time)
        }
      }
    }
    return this.storeAndReturn(session, fingerprint, this.applyValidation(value, config))
  }

  private derive(session: string, time: OpenCodeSessionTimeSource): string {
    return `ses_${this.contextHex12(session, time)}${digestTail62(session)}`
  }

  private context(request: SessionFormatRequest, session: string, time: OpenCodeSessionTimeSource): SessionFormatContext {
    return {
      provider: request.provider,
      model: request.model,
      rawSessionId: request.sessionId,
      sessionId: session,
      now: this.now(),
      hex12: this.contextHex12(session, time),
      tail62: digestTail62(session),
      sha256: sha256Hex(`${SHA256_SEED}/${session}`),
    }
  }

  private contextHex12(session: string, time: OpenCodeSessionTimeSource): string {
    return time === 'hash' ? hexTime12FromDigest(session) : this.mintHex12(session)
  }

  private mintHex12(session: string): string {
    let hex = this.minted.get(session)
    if (hex === undefined) {
      hex = hexTime12(this.now())
      this.minted.set(session, hex)
    }
    return hex
  }

  private applyValidation(value: string, config: ResolvedFormatConfig): string | undefined {
    if (config.validate === undefined || config.validate.test(value)) return value
    if (config.onInvalid === 'drop') {
      this.warnOnce(`x-opencode-session value failed validation and was dropped: ${value}`)
      return undefined
    }
    if (config.onInvalid === 'send') return value
    this.warnOnce(`x-opencode-session value failed validation but is still sent: ${value}`)
    return value
  }

  private storeAndReturn(
    session: string,
    fingerprint: string,
    value: string | undefined,
  ): string | undefined {
    // A cache hit re-inserts the entry so the Map's insertion order doubles as
    // LRU order. Without the delete-then-set the eviction below would discard
    // the coldest insertion rather than the least recently used one.
    this.cache.delete(session)
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(session, { fingerprint, value })
    return value
  }

  private warnOnce(message: string): void {
    if (this.warned.has(message)) return
    this.warned.add(message)
    this.log(message)
  }

  private async loadScript(path: string): Promise<ScriptModule | undefined> {
    const now = this.now()
    let slot = this.scripts.get(path)
    if (slot !== undefined && now - slot.stamp < SCRIPT_STAT_MIN_INTERVAL_MS) return slot.module
    if (slot === undefined) {
      slot = { mtimeMs: -1, stamp: now, module: undefined, loading: undefined }
      this.scripts.set(path, slot)
    }
    if (slot.loading !== undefined) {
      const result = await slot.loading
      slot.stamp = now
      return result
    }

    const info = await stat(path).catch((error: unknown) => {
      this.warnOnce(`script stat failed (${path}): ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    })
    if (info === undefined) return slot.module
    if (slot.module !== undefined && info.mtimeMs === slot.mtimeMs) {
      slot.stamp = now
      return slot.module
    }

    const loading = this.importScript(path, info.mtimeMs).then(
      (module) => {
        slot!.mtimeMs = info.mtimeMs
        slot!.module = module
        slot!.loading = undefined
        slot!.stamp = now
        return module
      },
      (error: unknown) => {
        this.warnOnce(`script load failed (${path}): ${error instanceof Error ? error.message : String(error)}`)
        slot!.loading = undefined
        return slot!.module
      },
    )
    slot.loading = loading
    return loading
  }

  private async importScript(path: string, mtimeMs: number): Promise<ScriptModule> {
    const url = `${pathToFileURL(path).href}?mtime=${mtimeMs}`
    const module = await import(url) as { format?: unknown; default?: unknown }
    const format = module.format ?? module.default
    if (typeof format !== 'function') {
      throw new Error('script must export a function named format (or a default function)')
    }
    return { format: (context: SessionFormatContext) => (format as (ctx: SessionFormatContext) => unknown)(context) }
  }
}