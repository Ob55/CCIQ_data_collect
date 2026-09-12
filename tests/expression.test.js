// Unit tests for the sandboxed expression engine (PRD §5.3).
import { describe, it, expect } from 'vitest'
import {
  parseExpression,
  evaluate,
  parseAndEvaluate,
  validateExpression,
} from '../src/lib/xlsform/expression.js'
import { ExpressionError } from '../src/lib/xlsform/errors.js'

const ev = (expr, values, now) => parseAndEvaluate(expr, { values, now })

describe('literals and references', () => {
  it('evaluates numbers and strings', () => {
    expect(ev('42')).toBe(42)
    expect(ev('3.5')).toBe(3.5)
    expect(ev("'hello'")).toBe('hello')
    expect(ev("''")).toBe('')
  })

  it('resolves field references, missing => empty string', () => {
    expect(ev('${age}', { age: 30 })).toBe(30)
    expect(ev('${missing}', {})).toBe('')
  })

  it('resolves "." to the current field value (self-reference)', () => {
    expect(parseAndEvaluate('. >= 0 and . <= 120', { self: 45 })).toBe(true)
    expect(parseAndEvaluate('. >= 0 and . <= 120', { self: 200 })).toBe(false)
    expect(parseAndEvaluate("string-length(.) <= 10", { self: 'short' })).toBe(true)
  })
})

describe('comparison and boolean logic', () => {
  it('compares numerically and by string', () => {
    expect(ev('${age} >= 18', { age: 18 })).toBe(true)
    expect(ev('${age} < 18', { age: 18 })).toBe(false)
    expect(ev("${color} = 'red'", { color: 'red' })).toBe(true)
    expect(ev("${color} != 'red'", { color: 'blue' })).toBe(true)
  })

  it('honours and/or/not with precedence', () => {
    expect(ev('${a} > 1 and ${b} > 1', { a: 2, b: 2 })).toBe(true)
    expect(ev('${a} > 1 and ${b} > 1', { a: 2, b: 0 })).toBe(false)
    expect(ev('${a} > 1 or ${b} > 1', { a: 0, b: 2 })).toBe(true)
    expect(ev('not(${a} > 1)', { a: 0 })).toBe(true)
    // and binds tighter than or
    expect(ev('${a} = 1 or ${b} = 1 and ${c} = 1', { a: 1, b: 0, c: 0 })).toBe(true)
  })
})

describe('arithmetic', () => {
  it('respects operator precedence', () => {
    expect(ev('2 + 3 * 4')).toBe(14)
    expect(ev('(2 + 3) * 4')).toBe(20)
    expect(ev('10 div 4')).toBe(2.5)
    expect(ev('10 mod 3')).toBe(1)
    expect(ev('-5 + 2')).toBe(-3)
  })
})

describe('functions', () => {
  it('selected / count-selected on space-delimited values', () => {
    expect(ev("selected(${langs}, 'sw')", { langs: 'en sw fr' })).toBe(true)
    expect(ev("selected(${langs}, 'de')", { langs: 'en sw fr' })).toBe(false)
    expect(ev('count-selected(${langs})', { langs: 'en sw fr' })).toBe(3)
    expect(ev('count-selected(${langs})', { langs: '' })).toBe(0)
  })

  it('string-length, int, number', () => {
    expect(ev('string-length(${name})', { name: 'Ada' })).toBe(3)
    expect(ev("int('7.9')")).toBe(7)
    expect(ev("number('42')")).toBe(42)
  })

  it('today() uses the injected clock', () => {
    const now = new Date(2026, 0, 15, 9, 30)
    const result = evaluate(parseExpression('today()'), { now })
    expect(result).toBeInstanceOf(Date)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getHours()).toBe(0) // truncated to midnight
  })
})

describe('grammar rejection (fails loudly, never eval)', () => {
  const bad = [
    '${age} >', // dangling operator
    'foo(1)', // unknown function
    '1 + + 2', // double operator
    '${age', // unterminated reference
    "'unterminated", // unterminated string
    'age = 1', // bareword instead of ${age}
    '1 &&', // unsupported operator
    'process.exit(1)', // looks like JS — must be rejected, never executed
  ]
  for (const expr of bad) {
    it(`rejects: ${expr}`, () => {
      expect(() => parseExpression(expr)).toThrow(ExpressionError)
      expect(validateExpression(expr).ok).toBe(false)
    })
  }

  it('validateExpression returns ok for valid input', () => {
    expect(validateExpression("${age} >= 18 and selected(${x}, 'a')").ok).toBe(true)
  })
})
