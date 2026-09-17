import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  digestTail62,
  hexTime12,
  normalizeSessionId,
  OPENCODE_SESSION_DEFAULT_REGEX,
  OpenCodeSessionFormatter,
  resolveFormatConfig,
} from '../src/host/opencode-session-format.ts'

const FIXED_NOW = 1727088000000
const SESSION_UUID = 'session-e8a7929f-8957-42c3-ad85-459e208fb91e'
const NORMALIZED_UUID = 'e8a7929f895742c3ad85459e208fb91e'

const defaultRequest = { provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: SESSION_UUID }

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function formatter(): OpenCodeSessionFormatter {
  return new OpenCodeSessionFormatter({ now: () => FIXED_NOW, log: () => undefined })
}

const sessionRegex = new RegExp(OPENCODE_SESSION_DEFAULT_REGEX)

describe('normalizeSessionId', () => {
  it('strips the lowercase DSH prefix, hyphens and case', () => {
    expect(normalizeSessionId(SESSION_UUID)).toBe(NORMALIZED_UUID)
    expect(normalizeSessionId('e8a7929f-8957-42c3-ad85-459e208fb91e')).toBe(NORMALIZED_UUID)
    expect(normalizeSessionId(NORMALIZED_UUID)).toBe(NORMALIZED_UUID)
    expect(normalizeSessionId('session-abc-123')).toBe('abc123')
  })

  it('keeps a non-empty raw value as the fallback', () => {
    expect(normalizeSessionId('')).toBe('')
    expect(normalizeSessionId('   ')).toBe('')
    expect(normalizeSessionId('session-')).toBe('session-')
  })
})

describe('hexTime12', () => {
  it('produces exactly 12 lowercase hex digits and masks to 48 bits', () => {
    expect(hexTime12(0)).toBe('000000000000')
    expect(hexTime12(1)).toBe('000000000001')
    expect(hexTime12(FIXED_NOW)).toMatch(/^[0-9a-f]{12}$/)
    const overflow = BigInt(0xffffffffffffn) + 1n
    expect(hexTime12(Number(overflow))).toBe('000000000000')
  })
})

describe('digestTail62', () => {
  it('is a deterministic 14-character Base62 block per session', () => {
    const tail = digestTail62(NORMALIZED_UUID)
    expect(tail).toMatch(/^[0-9A-Za-z]{14}$/)
    expect(tail).toHaveLength(14)
    expect(digestTail62(NORMALIZED_UUID)).toBe(tail)
    expect(digestTail62('another-session')).not.toBe(tail)
  })

  it('maps normalized variants of the same session to the same tail', () => {
    expect(digestTail62(normalizeSessionId(SESSION_UUID))).toBe(digestTail62(NORMALIZED_UUID))
  })
})

describe('resolveFormatConfig', () => {
  it('resolves defaults for an absent format section', () => {
    const resolved = resolveFormatConfig(undefined)
    expect(resolved).toEqual({
      mode: 'ses-derive',
      time: 'firstUse',
      template: '',
      expression: '',
      script: '',
      validateSource: '',
      validate: undefined,
      onInvalid: 'warn',
    })
  })

  it('reads the format section under opencodeSession', () => {
    const resolved = resolveFormatConfig({
      opencodeSession: {
        format: { mode: 'template', template: 'x_{hex12}', onInvalid: 'drop', validate: '^x' },
      },
    })
    expect(resolved.mode).toBe('template')
    expect(resolved.template).toBe('x_{hex12}')
    expect(resolved.onInvalid).toBe('drop')
    expect(resolved.validate).toBeInstanceOf(RegExp)
  })

  it('falls back to defaults for unknown or malformed values', () => {
    const resolved = resolveFormatConfig({
      opencodeSession: { format: { mode: 'unknown-mode', time: 'never', onInvalid: 'explode', validate: '(' } },
    })
    expect(resolved.mode).toBe('ses-derive')
    expect(resolved.time).toBe('firstUse')
    expect(resolved.onInvalid).toBe('warn')
    expect(resolved.validate).toBeUndefined()
  })

  it('ignores a format section that is not a record', () => {
    expect(resolveFormatConfig({ opencodeSession: { format: 'ses-derive' } }).mode).toBe('ses-derive')
  })
})

describe('OpenCodeSessionFormatter ses-derive', () => {
  it('produces the canonical 30-character value with injected time', () => {
    const value = formatter().format(defaultRequest, resolveFormatConfig(undefined)) as string
    expect(value).toBe(`ses_${hexTime12(FIXED_NOW)}${digestTail62(NORMALIZED_UUID)}`)
    expect(value).toHaveLength(30)
    expect(value).toMatch(sessionRegex)
  })

  it('is stable per session and different across sessions', () => {
    const instance = formatter()
    const first = instance.format(defaultRequest, resolveFormatConfig(undefined)) as string
    const second = instance.format(defaultRequest, resolveFormatConfig(undefined)) as string
    const other = instance.format(
      { ...defaultRequest, sessionId: 'session-11111111-1111-4111-8111-111111111111' },
      resolveFormatConfig(undefined),
    ) as string
    expect(second).toBe(first)
    expect(other).not.toBe(first)
    expect(other).toMatch(sessionRegex)
  })

  it('mints the hex block once per session even after cache invalidation by config change', () => {
    const instance = formatter()
    const config = resolveFormatConfig(undefined)
    const first = instance.format(defaultRequest, config) as string
    const passthrough = resolveFormatConfig({ opencodeSession: { format: { mode: 'passthrough' } } })
    expect(instance.format(defaultRequest, passthrough)).toBe(SESSION_UUID)
    const backToDerive = instance.format(defaultRequest, config) as string
    expect(backToDerive.slice(4, 16)).toBe(first.slice(4, 16))
  })

  it('time: hash derives an identical value without relying on cache', () => {
    const config = resolveFormatConfig({ opencodeSession: { format: { time: 'hash' } } })
    const left = formatter().format(defaultRequest, config) as string
    const right = formatter().format(defaultRequest, config) as string
    expect(left).toBe(right)
    expect(left.slice(4, 16)).toBe(sha256Hex(`dsh-thinking-effort/opencode-session/${NORMALIZED_UUID}`).slice(0, 12))
    expect(left).toMatch(sessionRegex)
  })
})

describe('OpenCodeSessionFormatter modes', () => {
  it('passthrough returns the raw session id', () => {
    const config = resolveFormatConfig({ opencodeSession: { format: { mode: 'passthrough' } } })
    expect(formatter().format(defaultRequest, config)).toBe(SESSION_UUID)
  })

  it('template renders placeholders from the session context', () => {
    const config = resolveFormatConfig({
      opencodeSession: { format: { mode: 'template', template: 'tmpl_{hex12}-{tail62}-{provider}/{model}' } },
    })
    const value = formatter().format(defaultRequest, config) as string
    expect(value).toBe(`tmpl_${hexTime12(FIXED_NOW)}-${digestTail62(NORMALIZED_UUID)}-opencode-go/deepseek-v4-flash`)
  })

  it('template falls back to ses-derive when the template is empty', () => {
    const config = resolveFormatConfig({ opencodeSession: { format: { mode: 'template' } } })
    const value = formatter().format(defaultRequest, config) as string
    expect(value).toMatch(sessionRegex)
  })

  it('expression composes the same value as ses-derive', () => {
    const config = resolveFormatConfig({
      opencodeSession: { format: { mode: 'expression', expression: "'ses_' + hex12 + tail62" } },
    })
    const value = formatter().format(defaultRequest, config) as string
    expect(value).toBe(`ses_${hexTime12(FIXED_NOW)}${digestTail62(NORMALIZED_UUID)}`)
  })

  it('expression supports the sha256/slice/lower/upper helpers', () => {
    const config = resolveFormatConfig({
      opencodeSession: { format: { mode: 'expression', expression: 'upper(slice(sha256(sessionId), 0, 6))' } },
    })
    const value = formatter().format(defaultRequest, config) as string
    expect(value).toBe(sha256Hex(NORMALIZED_UUID).slice(0, 6).toUpperCase())
  })

  it('expression falls back to ses-derive on a malformed expression', () => {
    const config = resolveFormatConfig({
      opencodeSession: { format: { mode: 'expression', expression: "'ses_' + missing + (" } },
    })
    const value = formatter().format(defaultRequest, config) as string
    expect(value).toMatch(sessionRegex)
  })

  it('script loads an ESM file and calls format with the context', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-oc-script-'))
    try {
      const script = join(directory, 'session.mjs')
      await writeFile(script, "export function format(ctx) { return 'external_' + ctx.hex12 + ctx.tail62 }\n")
      const config = resolveFormatConfig({ opencodeSession: { format: { mode: 'script', script } } })
      const value = await formatter().format(defaultRequest, config)
      expect(value).toBe(`external_${hexTime12(FIXED_NOW)}${digestTail62(NORMALIZED_UUID)}`)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('script reloads on mtime change but only outside the stat window', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-oc-script-'))
    try {
      const script = join(directory, 'session.mjs')
      let fakeNow = 1_000_000
      const instance = new OpenCodeSessionFormatter({ now: () => fakeNow, log: () => undefined })
      const config = resolveFormatConfig({ opencodeSession: { format: { mode: 'script', script } } })

      await writeFile(script, "export function format() { return 'v1' }\n")
      expect(await instance.format(defaultRequest, config)).toBe('v1')

      // Within the stat window the old module stays.
      fakeNow += 500
      await writeFile(script, "export function format() { return 'v2' }\n")
      expect(await instance.format({ ...defaultRequest, sessionId: 'session-other' }, config)).toBe('v1')

      // Outside the stat window the module reloads.
      fakeNow += 2000
      expect(await instance.format({ ...defaultRequest, sessionId: 'session-other-2' }, config)).toBe('v2')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('script falls back to ses-derive when the file cannot be loaded', async () => {
    const config = resolveFormatConfig({
      opencodeSession: { format: { mode: 'script', script: join(tmpdir(), 'missing-session-script.mjs') } },
    })
    const value = await formatter().format(defaultRequest, config)
    expect(value).toMatch(sessionRegex)
  })
})

describe('OpenCodeSessionFormatter validation', () => {
  it('drops the value when onInvalid is drop', () => {
    const config = resolveFormatConfig({
      opencodeSession: { format: { mode: 'passthrough', validate: '^abc$', onInvalid: 'drop' } },
    })
    expect(formatter().format(defaultRequest, config)).toBeUndefined()
  })

  it('still sends the value on warn and send', () => {
    const warnConfig = resolveFormatConfig({
      opencodeSession: { format: { mode: 'passthrough', validate: '^abc$', onInvalid: 'warn' } },
    })
    expect(formatter().format(defaultRequest, warnConfig)).toBe(SESSION_UUID)
    const sendConfig = resolveFormatConfig({
      opencodeSession: { format: { mode: 'passthrough', validate: '^abc$', onInvalid: 'send' } },
    })
    expect(formatter().format(defaultRequest, sendConfig)).toBe(SESSION_UUID)
  })

  it('passes values that satisfy a custom validation regex', () => {
    const config = resolveFormatConfig({
      opencodeSession: { format: { mode: 'passthrough', validate: `^${'x'.repeat(30)}$`, onInvalid: 'drop' } },
    })
    const request = { ...defaultRequest, sessionId: 'x'.repeat(30) }
    expect(formatter().format(request, config)).toBe('x'.repeat(30))
  })
})