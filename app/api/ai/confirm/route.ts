import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase-admin'
import { MUTATING_TOOLS, executeTool } from '@/lib/ai-tools'
import { consumeApprovalByFingerprint } from '@/lib/assistant-approvals'
import { encodeEvent, toolLabel, summariseResult, type TuiEvent } from '@/lib/tui/receipts'

// Running a confirmed action, without the model.
//
// The Confirm button used to post "Yes — go ahead." into the chat with the
// fingerprint attached, and rely on the model to reissue the identical tool
// call so the executor would let it through. That worked most of the time and
// failed silently the rest: the model would answer "sending it now" in plain
// text, no tool_use block was produced, so no tool ran, no receipt appeared,
// and the invoice was never sent. Arlo pressed a button, got a sentence saying
// it was done, and nothing had happened. For a button whose whole job is to
// authorise something irreversible, "usually executes" is not a bar worth
// clearing.
//
// The chat route parks the exact call when the gate refuses it, and this
// endpoint redeems it. The fingerprint the browser sends is only ever a lookup
// key for that parked row — the tool name and arguments come from the row, not
// from the request, so a tampered fingerprint can only ever fail to match.
// The same fingerprint is then handed to executeTool as the approval, which is
// what satisfies the CONFIRM_TOOLS gate.
export async function POST(request: NextRequest) {
  if (!(await getAuthUser())) return unauthorizedResponse()

  const { fingerprint } = await request.json()
  if (typeof fingerprint !== 'string' || !fingerprint) {
    return Response.json({ error: 'fingerprint is required.' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  // Consumed on read, so a double-tap cannot send the same invoice twice.
  const pending = await consumeApprovalByFingerprint(supabase, fingerprint)
  if (!pending) {
    return Response.json(
      { error: 'That confirmation has expired or was already used. Ask Tui to set it up again.' },
      { status: 409 },
    )
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: TuiEvent) => controller.enqueue(encoder.encode(encodeEvent(event)))

      try {
        const toolUseId = `confirm-${pending.fingerprint}`
        send({
          t: 'tool',
          id: toolUseId,
          name: pending.toolName,
          label: toolLabel(pending.toolName, pending.toolInput),
        })

        const result = await executeTool(pending.toolName, pending.toolInput, supabase, {
          approvals: [pending.fingerprint],
        })

        const { ok, detail } = summariseResult(result)
        send({ t: 'tool_done', id: toolUseId, ok, detail })

        if (ok && MUTATING_TOOLS.has(pending.toolName)) send({ t: 'mutated' })

        // The reply is written here rather than by the model: this endpoint
        // never calls Claude, and the outcome is already fully known from the
        // tool result. One short line, same voice as the rest of the thread.
        let parsed: Record<string, unknown> = {}
        try {
          parsed = JSON.parse(result) as Record<string, unknown>
        } catch { /* non-JSON result */ }

        const text = ok
          ? typeof parsed.sent_to === 'string'
            ? `Sent ${parsed.invoice_number ?? 'it'} to ${parsed.sent_to}.`
            : 'Done.'
          : `That didn't go through. ${typeof parsed.error === 'string' ? parsed.error : 'Xero refused it.'}`

        send({ t: 'text', v: text })
        send({ t: 'done' })
        controller.close()
      } catch (err) {
        console.error('AI confirm error:', err)
        send({ t: 'error', v: 'Something went wrong running that. Nothing was sent.' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}
