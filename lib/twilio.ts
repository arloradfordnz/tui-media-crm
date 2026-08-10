import crypto from 'crypto'

/** Sends an SMS via the Twilio REST API. Returns the message SID, or null on failure. */
export async function sendSms(to: string, body: string): Promise<string | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from) {
    console.error('[twilio] Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER')
    return null
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  })

  if (!res.ok) {
    console.error('[twilio] Send failed:', res.status, await res.text().catch(() => ''))
    return null
  }

  const data = await res.json()
  return data.sid ?? null
}

/**
 * Verifies a Twilio webhook request actually came from Twilio, per their
 * signature scheme: HMAC-SHA1 of the full request URL + sorted POST params,
 * base64-encoded, compared to the X-Twilio-Signature header.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * Without this, anyone who finds the inbound-SMS URL could POST fake
 * messages that get executed by the tool-using agent (which can mutate the
 * CRM) — so this check is not optional.
 */
export function verifyTwilioSignature(url: string, params: Record<string, string>, signatureHeader: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token || !signatureHeader) return false

  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)

  const expected = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64')

  // Constant-time comparison to avoid a timing side-channel.
  const a = Buffer.from(expected)
  const b = Buffer.from(signatureHeader)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
