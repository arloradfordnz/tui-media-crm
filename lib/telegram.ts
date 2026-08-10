import crypto from 'crypto'

/** Sends a message via the Telegram Bot API. Returns the message_id, or null on failure. */
export async function sendTelegramMessage(text: string): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.error('[telegram] Missing TELEGRAM_BOT_TOKEN / OWNER_TELEGRAM_CHAT_ID')
    return null
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })

  if (!res.ok) {
    console.error('[telegram] Send failed:', res.status, await res.text().catch(() => ''))
    return null
  }

  const data = await res.json()
  return data.result?.message_id ?? null
}

/**
 * Registers the webhook URL with Telegram, with a secret token Telegram will
 * echo back on every request so we can verify it's really Telegram calling.
 */
export async function setTelegramWebhook(url: string, secretToken: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return false
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secretToken }),
  })
  return res.ok
}

/**
 * Verifies an inbound webhook request came from Telegram. Telegram echoes
 * the secret_token set via setTelegramWebhook back as this header on every
 * call — without checking it, anyone who finds the webhook URL could POST
 * fake messages at an agent with CRM write access.
 * https://core.telegram.org/bots/api#setwebhook
 */
export function verifyTelegramSecret(headerValue: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected || !headerValue) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(headerValue)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
