import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTwilioSignature } from '@/lib/twilio'
import { runSmsAgentTurn } from '@/lib/sms-agent'

// Twilio expects a fast webhook response (default ~15s timeout). The agent
// loop can take longer than that across several tool-calling rounds, and the
// actual SMS reply goes out via the Twilio REST API from inside the loop —
// not via this response — so we ack Twilio immediately and let the agent
// keep running via Next's after(), instead of awaiting it inline.
export const maxDuration = 60

// Twilio webhook — "A MESSAGE COMES IN" for the assistant's number, configured
// in the Twilio console to POST here. Runs unauthenticated (Twilio can't send
// our session cookie), so the signature check below is what stops anyone else
// from POSTing fake messages at an agent that can mutate the CRM.
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role credentials missing')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody))

  const signature = req.headers.get('x-twilio-signature')
  // Twilio signs the exact public URL it POSTed to — reconstruct it rather
  // than trusting req.url, which can be rewritten behind Vercel's proxy.
  const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/sms/inbound`
  if (!verifyTwilioSignature(publicUrl, params, signature)) {
    console.error('[sms/inbound] Signature verification failed')
    return new NextResponse('Unauthorized', { status: 403 })
  }

  const from = params.From
  const ownerPhone = process.env.OWNER_PHONE_NUMBER
  if (!ownerPhone || from !== ownerPhone) {
    // Only Arlo's own number drives the agent — anyone else texting the
    // Twilio number (wrong number, spam) is logged but ignored.
    console.warn('[sms/inbound] Message from non-owner number, ignoring:', from)
    return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
  }

  const body = params.Body ?? ''
  const supabase = getServiceClient()

  await supabase.from('sms_messages').insert({
    direction: 'inbound',
    body,
    twilio_sid: params.MessageSid ?? null,
  })

  // Reply is sent via the Twilio REST API inside runSmsAgentTurn (send_sms
  // tool), not via TwiML — that lets the agent take tool-calling rounds
  // first. Run it after the response goes out so Twilio's webhook doesn't
  // time out waiting on the full tool loop.
  after(() =>
    runSmsAgentTurn(supabase, { trigger: 'inbound', inboundBody: body }).catch((err) => {
      console.error('[sms/inbound] Agent turn failed:', err)
    })
  )

  return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
}
