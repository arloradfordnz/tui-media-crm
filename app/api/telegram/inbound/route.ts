import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTelegramSecret } from '@/lib/telegram'
import { runAssistantTurn } from '@/lib/assistant-agent'

// Telegram expects a fast webhook ack. The agent loop can take longer across
// several tool-calling rounds, and the actual reply goes out via the
// Telegram API from inside the loop — not via this response — so we ack
// immediately and let the agent keep running via Next's after().
export const maxDuration = 60

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role credentials missing')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (!verifyTelegramSecret(secret)) {
    console.error('[telegram/inbound] Secret verification failed')
    return new NextResponse('Unauthorized', { status: 403 })
  }

  const update = await req.json()
  const message = update.message
  if (!message?.text) {
    return NextResponse.json({ ok: true })
  }

  const chatId = String(message.chat?.id ?? '')
  const ownerChatId = process.env.OWNER_TELEGRAM_CHAT_ID
  if (!ownerChatId || chatId !== ownerChatId) {
    // Only Arlo's own chat drives the agent — anyone else who finds the bot
    // is logged but ignored.
    console.warn('[telegram/inbound] Message from non-owner chat, ignoring:', chatId)
    return NextResponse.json({ ok: true })
  }

  const body = message.text as string
  const supabase = getServiceClient()

  await supabase.from('sms_messages').insert({
    direction: 'inbound',
    body,
    twilio_sid: message.message_id ? String(message.message_id) : null,
  })

  after(() =>
    runAssistantTurn(supabase, { trigger: 'inbound', inboundBody: body }).catch((err) => {
      console.error('[telegram/inbound] Agent turn failed:', err)
    })
  )

  return NextResponse.json({ ok: true })
}
