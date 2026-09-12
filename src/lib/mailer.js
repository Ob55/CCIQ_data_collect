// @ts-check
// Outbound email via SMTP (used for user invites, §7 screen 6). Server-only: SMTP
// credentials must never reach the client bundle. All calls are made from server actions.
import 'server-only'
import nodemailer from 'nodemailer'

/** @type {import('nodemailer').Transporter | null} */
let cached = null

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD } = process.env
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USERNAME || !SMTP_PASSWORD) return null
  if (!cached) {
    const port = Number(SMTP_PORT)
    cached = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 uses STARTTLS
      auth: { user: SMTP_USERNAME, pass: SMTP_PASSWORD },
    })
  }
  return cached
}

/** True when SMTP env is present, so callers can fall back gracefully when it isn't. */
export function isMailerConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USERNAME && process.env.SMTP_PASSWORD)
}

/**
 * Send an email. Throws if SMTP is not configured or delivery fails.
 * @param {{ to: string, subject: string, html?: string, text?: string }} msg
 */
export async function sendMail({ to, subject, html, text }) {
  const transport = getTransport()
  if (!transport) throw new Error('SMTP is not configured.')
  const from = process.env.SMTP_FROM || process.env.SMTP_USERNAME
  await transport.sendMail({ from, to, subject, html, text })
}
