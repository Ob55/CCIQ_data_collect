// @ts-check
// Client-safe helpers that evaluate XLSForm expressions against live form values.
// Uses the sandboxed engine (no eval). A malformed expression was already rejected at
// upload time, so at runtime we fail open (treat as visible / valid) rather than crash.
import { parseExpression, evaluate } from '@/lib/xlsform/expression'

const cache = new Map()
function compile(expr) {
  if (!cache.has(expr)) cache.set(expr, parseExpression(expr))
  return cache.get(expr)
}

/** relevant: is the field shown? Empty relevant => always shown. */
export function isRelevant(expr, values) {
  if (!expr) return true
  try {
    return Boolean(evaluate(compile(expr), { values }))
  } catch {
    return true
  }
}

/** constraint: is the current value valid? Empty value or empty constraint => valid. */
export function passesConstraint(expr, values, self) {
  if (!expr) return true
  if (self === undefined || self === null || self === '') return true
  try {
    return Boolean(evaluate(compile(expr), { values, self }))
  } catch {
    return true
  }
}

/** calculation: compute the derived value. */
export function calculate(expr, values) {
  if (!expr) return ''
  try {
    return evaluate(compile(expr), { values })
  } catch {
    return ''
  }
}

/** Is a `required` cell truthy? It's either a boolean or an expression string. */
export function isRequired(required, values) {
  if (typeof required === 'boolean') return required
  if (!required) return false
  try {
    return Boolean(evaluate(compile(required), { values }))
  } catch {
    return false
  }
}

/** Pick a label string for the active language, with sensible fallbacks. */
export function labelFor(field, language) {
  const l = field.label
  if (!l) return field.name
  return l[language] ?? Object.values(l)[0] ?? field.name
}

export function textFor(translated, language) {
  if (!translated) return ''
  return translated[language] ?? Object.values(translated)[0] ?? ''
}
