import { describe, expect, it } from 'vitest'
import {
  collectExpressionNames,
  EXPRESSION_HELPER_NAMES,
  parseExpression,
  SESSION_CONTEXT_KEYS,
} from '../src/compat/opencode-expression.js'

describe('parseExpression', () => {
  it('accepts a well-formed additive expression', () => {
    expect(() => parseExpression("'ses_' + hex12 + tail62")).not.toThrow()
  })

  it('accepts the documented helpers with arguments', () => {
    expect(() => parseExpression('upper(slice(sha256(sessionId), 0, 6))')).not.toThrow()
  })

  it('accepts a bare identifier reference', () => {
    expect(() => parseExpression('hex12')).not.toThrow()
  })

  it('rejects an unterminated string literal', () => {
    expect(() => parseExpression("'abc")).toThrow(/unterminated string literal/)
  })

  it('rejects an unexpected character', () => {
    expect(() => parseExpression('a * b')).toThrow(/unexpected character/)
  })

  it('rejects a missing closing parenthesis', () => {
    expect(() => parseExpression("'x' + (hex12")).toThrow()
  })

  it('rejects trailing tokens after a complete expression', () => {
    expect(() => parseExpression("'x' 'y'")).toThrow(/unexpected token/)
  })

  it('rejects an empty source', () => {
    expect(() => parseExpression('')).toThrow()
  })
})

describe('collectExpressionNames', () => {
  it('collects the refs of a derived-value expression', () => {
    expect(collectExpressionNames(parseExpression("'ses_' + hex12 + tail62")))
      .toEqual({ refs: ['hex12', 'tail62'], calls: [] })
  })

  it('collects nested calls and their argument refs', () => {
    expect(collectExpressionNames(parseExpression('upper(slice(sha256(sessionId), 0, 6))')))
      .toEqual({ refs: ['sessionId'], calls: ['upper', 'slice', 'sha256'] })
  })

  it('collects a bare identifier', () => {
    expect(collectExpressionNames(parseExpression('hex12'))).toEqual({ refs: ['hex12'], calls: [] })
  })

  it('collects nothing from a literal-only expression', () => {
    expect(collectExpressionNames(parseExpression("'constant'"))).toEqual({ refs: [], calls: [] })
  })

  it('exposes the two authoritative name lists', () => {
    expect([...SESSION_CONTEXT_KEYS]).toEqual(['provider', 'model', 'rawSessionId', 'sessionId', 'now', 'hex12', 'tail62', 'sha256'])
    expect([...EXPRESSION_HELPER_NAMES]).toEqual(['sha256', 'slice', 'lower', 'upper'])
  })

  it('keeps the shared helper list in step with the Host table', () => {
    // The Host's `satisfies Record<typeof EXPRESSION_HELPER_NAMES[number], …>`
    // makes a mismatch a type error; this asserts the list itself is the
    // documented one so a rename cannot pass silently on both sides.
    expect(EXPRESSION_HELPER_NAMES).toContain('sha256')
    expect(EXPRESSION_HELPER_NAMES).toHaveLength(4)
  })
})
