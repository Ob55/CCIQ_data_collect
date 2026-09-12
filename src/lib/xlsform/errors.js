// Error types for the XLSForm parser. These carry enough context (row number, offending
// value) to show the uploader a precise, actionable message (PRD §5.2, §5.3).

/** A fatal problem that must fail the upload. */
export class XlsformError extends Error {
  /**
   * @param {string} message
   * @param {{ row?: number, sheet?: string, value?: string }} [detail]
   */
  constructor(message, detail = {}) {
    super(message)
    this.name = 'XlsformError'
    this.row = detail.row
    this.sheet = detail.sheet
    this.value = detail.value
  }
}

/** An invalid expression in relevant/constraint/calculation. */
export class ExpressionError extends Error {
  /**
   * @param {string} message
   * @param {{ position?: number, expression?: string }} [detail]
   */
  constructor(message, detail = {}) {
    super(message)
    this.name = 'ExpressionError'
    this.position = detail.position
    this.expression = detail.expression
  }
}
