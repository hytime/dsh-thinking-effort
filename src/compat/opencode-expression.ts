// Shared, dependency-free expression parsing for `opencodeSession.format`.
//
// This module is imported by BOTH the Host (to evaluate a configured
// expression) and the browser Client (to validate one before saving). It
// must therefore stay free of `node:` imports: the client bundle runs in a
// browser and `alwaysBundle` would pull any Node builtin into it.

export type Token =
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'number'; readonly value: string }
  | { readonly type: 'ident'; readonly value: string }
  | { readonly type: 'op'; readonly value: string }
  | { readonly type: 'lparen' | 'rparen' | 'comma' | 'eof'; readonly value: string }

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      index += 1
      continue
    }
    if (char === '"' || char === "'") {
      const quote = char
      index += 1
      let value = ''
      let closed = false
      while (index < source.length) {
        const current = source[index]
        if (current === '\\') {
          value += source[index + 1] ?? ''
          index += 2
          continue
        }
        if (current === quote) {
          index += 1
          closed = true
          break
        }
        value += current
        index += 1
      }
      if (!closed) throw new Error('unterminated string literal')
      tokens.push({ type: 'string', value })
      continue
    }
    if (/[0-9]/.test(char)) {
      let value = ''
      while (index < source.length && /[0-9.]/.test(source[index]!)) {
        value += source[index]
        index += 1
      }
      tokens.push({ type: 'number', value })
      continue
    }
    if (/[A-Za-z_]/.test(char)) {
      let value = ''
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index]!)) {
        value += source[index]
        index += 1
      }
      tokens.push({ type: 'ident', value })
      continue
    }
    if (char === '(') { tokens.push({ type: 'lparen', value: '(' }); index += 1; continue }
    if (char === ')') { tokens.push({ type: 'rparen', value: ')' }); index += 1; continue }
    if (char === ',') { tokens.push({ type: 'comma', value: ',' }); index += 1; continue }
    if (char === '+') { tokens.push({ type: 'op', value: '+' }); index += 1; continue }
    throw new Error(`unexpected character '${char}'`)
  }
  tokens.push({ type: 'eof', value: '' })
  return tokens
}

export type Node =
  | { readonly kind: 'literal'; readonly value: string | number }
  | { readonly kind: 'ref'; readonly name: string }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly Node[] }
  | { readonly kind: 'binary'; readonly op: '+'; readonly left: Node; readonly right: Node }

export class ExpressionParser {
  private index = 0
  constructor(private readonly tokens: readonly Token[]) {}

  parse(): Node {
    const node = this.parseAdditive()
    const tail = this.tokens[this.index]
    if (tail?.type !== 'eof') throw new Error(`unexpected token '${tail?.value ?? ''}'`)
    return node
  }

  private parseAdditive(): Node {
    let left = this.parsePrimary()
    while (this.tokens[this.index]?.type === 'op' && this.tokens[this.index]?.value === '+') {
      this.index += 1
      const right = this.parsePrimary()
      left = { kind: 'binary', op: '+', left, right }
    }
    return left
  }

  private parsePrimary(): Node {
    const token = this.tokens[this.index]
    if (token === undefined) throw new Error('unexpected end of expression')
    if (token.type === 'string') { this.index += 1; return { kind: 'literal', value: token.value } }
    if (token.type === 'number') { this.index += 1; return { kind: 'literal', value: Number(token.value) } }
    if (token.type === 'lparen') {
      this.index += 1
      const node = this.parseAdditive()
      if (this.tokens[this.index]?.type !== 'rparen') throw new Error("expected ')'")
      this.index += 1
      return node
    }
    if (token.type === 'ident') {
      const name = token.value
      this.index += 1
      if (this.tokens[this.index]?.type === 'lparen') {
        this.index += 1
        const args: Node[] = []
        if (this.tokens[this.index]?.type !== 'rparen') {
          args.push(this.parseAdditive())
          while (this.tokens[this.index]?.type === 'comma') {
            this.index += 1
            args.push(this.parseAdditive())
          }
        }
        if (this.tokens[this.index]?.type !== 'rparen') throw new Error("expected ')' after arguments")
        this.index += 1
        return { kind: 'call', name, args }
      }
      return { kind: 'ref', name }
    }
    throw new Error(`unexpected token '${token.value}'`)
  }
}

export function evaluateNode(
  node: Node,
  scope: object,
  funcs: Record<string, (...args: unknown[]) => unknown>,
): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value
    case 'ref': {
      const lookup = scope as Record<string, unknown>
      if (!Object.prototype.hasOwnProperty.call(lookup, node.name)) {
        throw new Error(`unknown identifier '${node.name}'`)
      }
      return lookup[node.name]
    }
    case 'call': {
      // Own-property check mirrors the scope lookup below: a plain object
      // literal inherits Object.prototype, so without it names like
      // `constructor` / `toString` / `__defineGetter__` would resolve.
      if (!Object.prototype.hasOwnProperty.call(funcs, node.name)) {
        throw new Error(`unknown function '${node.name}'`)
      }
      const fn = funcs[node.name]!
      return fn(...node.args.map((arg) => evaluateNode(arg, scope, funcs)))
    }
    case 'binary': {
      const left = evaluateNode(node.left, scope, funcs)
      const right = evaluateNode(node.right, scope, funcs)
      if (typeof left === 'number' && typeof right === 'number') return left + right
      return String(left) + String(right)
    }
  }
}

/**
 * Parse an expression without evaluating it.
 *
 * The Host uses this path indirectly (through {@link evaluateNode}) and the
 * Client uses it directly: a configuration that cannot be parsed makes the
 * Host fall back to `ses-derive`, so the card must refuse to save one.
 * @param source - expression text from the settings document.
 * @returns the parsed node.
 * @throws when the source is not a valid expression.
 */
export function parseExpression(source: string): Node {
  return new ExpressionParser(tokenize(source)).parse()
}
