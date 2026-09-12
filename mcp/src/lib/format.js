// @ts-check
// Helpers for shaping MCP tool results.

/**
 * Wrap a JS value as an MCP tool text result (pretty-printed JSON).
 * @param {unknown} value
 * @returns {{ content: Array<{ type: 'text', text: string }> }}
 */
export function toolText(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/**
 * Wrap an error as an MCP tool error result rather than throwing, so Claude sees a clear
 * message instead of a transport failure.
 * @param {unknown} err
 * @returns {{ content: Array<{ type: 'text', text: string }>, isError: true }}
 */
export function toolError(err) {
  const message = err instanceof Error ? err.message : String(err)
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
}
