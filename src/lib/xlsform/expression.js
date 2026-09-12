// @ts-check
// Sandboxed evaluator for the XLSForm expression subset (PRD §5.3).
// Tokenize -> recursive-descent parse to an AST -> evaluate.
// NEVER uses eval() or new Function(): form definitions are semi-trusted input, so
// executing them as JS would be a remote-code-execution hole.
import { ExpressionError } from './errors.js'

// The ONLY functions we implement. Anything else is rejected at parse time (§5.3).
const FUNCTIONS = new Set([
  'selected',
  'count-selected',
  'string-length',
  'today',
  'int',
  'number',
  'not',
])

// Word operators (XPath-style). These are not function names or field references.
const WORD_OPS = new Set(['and', 'or', 'div', 'mod'])

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------
/**
 * @param {string} input
 * @returns {Array<{ type: string, value?: any, name?: string, pos: number }>}
 */
function tokenize(input) {
  const tokens = []
  let i = 0
  const n = input.length

  const isDigit = (c) => c >= '0' && c <= '9'
  const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')

  while (i < n) {
    const c = input[i]

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }

    // Field reference ${name}
    if (c === '$' && input[i + 1] === '{') {
      const start = i
      i += 2
      let name = ''
      while (i < n && input[i] !== '}') {
        name += input[i]
        i++
      }
      if (input[i] !== '}') {
        throw new ExpressionError('Unterminated ${...} reference', { position: start })
      }
      i++ // consume }
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new ExpressionError(`Invalid field name in reference: \${${name}}`, { position: start })
      }
      tokens.push({ type: 'ref', name, pos: start })
      continue
    }

    // String literal '...' or "..."
    if (c === "'" || c === '"') {
      const quote = c
      const start = i
      i++
      let str = ''
      while (i < n && input[i] !== quote) {
        str += input[i]
        i++
      }
      if (input[i] !== quote) {
        throw new ExpressionError('Unterminated string literal', { position: start })
      }
      i++ // consume closing quote
      tokens.push({ type: 'string', value: str, pos: start })
      continue
    }

    // Number (integer or decimal)
    if (isDigit(c) || (c === '.' && isDigit(input[i + 1]))) {
      const start = i
      let num = ''
      while (i < n && (isDigit(input[i]) || input[i] === '.')) {
        num += input[i]
        i++
      }
      if ((num.match(/\./g) || []).length > 1) {
        throw new ExpressionError(`Invalid number: ${num}`, { position: start })
      }
      tokens.push({ type: 'number', value: Number(num), pos: start })
      continue
    }

    // Standalone "." — the current field's own value (XLSForm self-reference).
    // Documented extension to the §5.3 subset: constraints like ". >= 0" need it.
    if (c === '.') {
      tokens.push({ type: 'dot', pos: i })
      i++
      continue
    }

    // Identifier / word-operator / function name (may contain internal hyphens).
    if (isAlpha(c)) {
      const start = i
      let word = ''
      while (i < n && (isAlpha(input[i]) || isDigit(input[i]))) {
        word += input[i]
        i++
        // allow a hyphen only when the next char continues the word (count-selected)
        if (input[i] === '-' && isAlpha(input[i + 1])) {
          word += '-'
          i++
        }
      }
      tokens.push({ type: 'word', value: word, pos: start })
      continue
    }

    // Multi-char operators
    if (c === '!' && input[i + 1] === '=') {
      tokens.push({ type: 'op', value: '!=', pos: i })
      i += 2
      continue
    }
    if ((c === '<' || c === '>') && input[i + 1] === '=') {
      tokens.push({ type: 'op', value: c + '=', pos: i })
      i += 2
      continue
    }

    // Single-char operators / punctuation
    if ('=<>+-*'.includes(c)) {
      tokens.push({ type: 'op', value: c, pos: i })
      i++
      continue
    }
    if (c === '(') {
      tokens.push({ type: 'lparen', pos: i })
      i++
      continue
    }
    if (c === ')') {
      tokens.push({ type: 'rparen', pos: i })
      i++
      continue
    }
    if (c === ',') {
      tokens.push({ type: 'comma', pos: i })
      i++
      continue
    }

    throw new ExpressionError(`Unexpected character '${c}'`, { position: i })
  }

  tokens.push({ type: 'eof', pos: n })
  return tokens
}

// ---------------------------------------------------------------------------
// Parser (recursive descent). Precedence: or < and < comparison < add < mul < unary.
// ---------------------------------------------------------------------------
class Parser {
  constructor(tokens, source) {
    this.tokens = tokens
    this.source = source
    this.pos = 0
  }

  peek() {
    return this.tokens[this.pos]
  }
  next() {
    return this.tokens[this.pos++]
  }
  expect(type) {
    const t = this.next()
    if (t.type !== type) {
      throw new ExpressionError(`Expected ${type} but found '${t.value ?? t.type}'`, {
        position: t.pos,
      })
    }
    return t
  }

  parse() {
    const node = this.parseOr()
    const t = this.peek()
    if (t.type !== 'eof') {
      throw new ExpressionError(`Unexpected '${t.value ?? t.type}'`, { position: t.pos })
    }
    return node
  }

  parseOr() {
    let left = this.parseAnd()
    while (this.isWord('or')) {
      this.next()
      left = { type: 'binary', op: 'or', left, right: this.parseAnd() }
    }
    return left
  }

  parseAnd() {
    let left = this.parseComparison()
    while (this.isWord('and')) {
      this.next()
      left = { type: 'binary', op: 'and', left, right: this.parseComparison() }
    }
    return left
  }

  parseComparison() {
    let left = this.parseAdditive()
    while (this.isOp('=', '!=', '<', '<=', '>', '>=')) {
      const op = this.next().value
      left = { type: 'binary', op, left, right: this.parseAdditive() }
    }
    return left
  }

  parseAdditive() {
    let left = this.parseMultiplicative()
    while (this.isOp('+', '-')) {
      const op = this.next().value
      left = { type: 'binary', op, left, right: this.parseMultiplicative() }
    }
    return left
  }

  parseMultiplicative() {
    let left = this.parseUnary()
    while (this.isOp('*') || this.isWord('div') || this.isWord('mod')) {
      const t = this.next()
      const op = t.value
      left = { type: 'binary', op, left, right: this.parseUnary() }
    }
    return left
  }

  parseUnary() {
    if (this.isOp('-')) {
      this.next()
      return { type: 'unary', op: '-', operand: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  parsePrimary() {
    const t = this.peek()

    if (t.type === 'number') {
      this.next()
      return { type: 'number', value: t.value }
    }
    if (t.type === 'string') {
      this.next()
      return { type: 'string', value: t.value }
    }
    if (t.type === 'ref') {
      this.next()
      return { type: 'ref', name: t.name }
    }
    if (t.type === 'dot') {
      this.next()
      return { type: 'self' }
    }
    if (t.type === 'lparen') {
      this.next()
      const node = this.parseOr()
      this.expect('rparen')
      return node
    }
    if (t.type === 'word') {
      // Must be a function call: word followed by '('. Bare words are not allowed.
      if (WORD_OPS.has(t.value)) {
        throw new ExpressionError(`Unexpected operator '${t.value}'`, { position: t.pos })
      }
      this.next()
      if (!FUNCTIONS.has(t.value)) {
        throw new ExpressionError(`Unknown function '${t.value}'`, { position: t.pos })
      }
      this.expect('lparen')
      const args = []
      if (this.peek().type !== 'rparen') {
        args.push(this.parseOr())
        while (this.peek().type === 'comma') {
          this.next()
          args.push(this.parseOr())
        }
      }
      this.expect('rparen')
      return { type: 'call', name: t.value, args }
    }

    throw new ExpressionError(`Unexpected '${t.value ?? t.type}'`, { position: t.pos })
  }

  isOp(...values) {
    const t = this.peek()
    return t.type === 'op' && values.includes(t.value)
  }
  isWord(value) {
    const t = this.peek()
    return t.type === 'word' && t.value === value
  }
}

/**
 * Parse an expression into an AST. Throws ExpressionError on anything outside the grammar.
 * @param {string} input
 * @returns {object} AST
 */
export function parseExpression(input) {
  try {
    return new Parser(tokenize(input), input).parse()
  } catch (err) {
    if (err instanceof ExpressionError) {
      err.expression = input
    }
    throw err
  }
}

/**
 * Validate an expression without evaluating it.
 * @param {string} input
 * @returns {{ ok: true } | { ok: false, error: string, position?: number }}
 */
export function validateExpression(input) {
  try {
    parseExpression(input)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message, position: err.position }
  }
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------
function isNumericLike(v) {
  if (typeof v === 'number') return !Number.isNaN(v)
  if (typeof v === 'string') return v.trim() !== '' && !Number.isNaN(Number(v))
  return false
}

function toNumber(v) {
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v === null || v === undefined || v === '') return NaN
  return Number(v)
}

function toBool(v) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v)
  if (v instanceof Date) return true
  if (v === null || v === undefined) return false
  return String(v).length > 0 // XPath: any non-empty string is true
}

function selectedTokens(v) {
  return String(v ?? '')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Evaluate an AST against a set of field values.
 * @param {object} ast
 * @param {{ values?: Record<string, any>, now?: Date, self?: any }} [context]
 *   `self` is the current field's value, referenced by "." in a constraint.
 * @returns {any}
 */
export function evaluate(ast, context = {}) {
  const values = context.values ?? {}
  const now = context.now ?? new Date()
  const self = context.self ?? ''

  function ev(node) {
    switch (node.type) {
      case 'number':
        return node.value
      case 'string':
        return node.value
      case 'self':
        return self
      case 'ref':
        return Object.prototype.hasOwnProperty.call(values, node.name) ? values[node.name] : ''
      case 'unary':
        return -toNumber(ev(node.operand))
      case 'binary':
        return evBinary(node)
      case 'call':
        return evCall(node)
      default:
        throw new ExpressionError(`Cannot evaluate node type '${node.type}'`)
    }
  }

  function evBinary(node) {
    const { op } = node
    if (op === 'and') return toBool(ev(node.left)) && toBool(ev(node.right))
    if (op === 'or') return toBool(ev(node.left)) || toBool(ev(node.right))

    const l = ev(node.left)
    const r = ev(node.right)

    switch (op) {
      case '=':
        return isNumericLike(l) && isNumericLike(r)
          ? toNumber(l) === toNumber(r)
          : String(l) === String(r)
      case '!=':
        return isNumericLike(l) && isNumericLike(r)
          ? toNumber(l) !== toNumber(r)
          : String(l) !== String(r)
      case '<':
        return toNumber(l) < toNumber(r)
      case '<=':
        return toNumber(l) <= toNumber(r)
      case '>':
        return toNumber(l) > toNumber(r)
      case '>=':
        return toNumber(l) >= toNumber(r)
      case '+':
        return toNumber(l) + toNumber(r)
      case '-':
        return toNumber(l) - toNumber(r)
      case '*':
        return toNumber(l) * toNumber(r)
      case 'div':
        return toNumber(l) / toNumber(r)
      case 'mod':
        return toNumber(l) % toNumber(r)
      default:
        throw new ExpressionError(`Unknown operator '${op}'`)
    }
  }

  function evCall(node) {
    const a = node.args
    switch (node.name) {
      case 'not':
        return !toBool(ev(a[0]))
      case 'selected': {
        const haystack = selectedTokens(ev(a[0]))
        return haystack.includes(String(ev(a[1])))
      }
      case 'count-selected':
        return selectedTokens(ev(a[0])).length
      case 'string-length':
        return String(ev(a[0]) ?? '').length
      case 'int':
        return Math.trunc(toNumber(ev(a[0])))
      case 'number':
        return toNumber(ev(a[0]))
      case 'today': {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        return d
      }
      default:
        throw new ExpressionError(`Unknown function '${node.name}'`)
    }
  }

  return ev(ast)
}

/**
 * Convenience: parse then evaluate.
 * @param {string} input
 * @param {{ values?: Record<string, any>, now?: Date }} [context]
 */
export function parseAndEvaluate(input, context) {
  return evaluate(parseExpression(input), context)
}
