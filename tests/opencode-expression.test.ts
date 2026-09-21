import { describe, expect, it } from 'vitest'
import { parseExpression } from '../src/compat/opencode-expression.js'

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
