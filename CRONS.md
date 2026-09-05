# Schedules

All times are UTC, because that is what Vercel cron takes. NZ is UTC+12 (+13 in
daylight saving), so the offsets below are what actually matters.

| Route | UTC | NZ | What it is |
|---|---|---|---|
| `/api/morning-briefing` | 19:00 | 7:00am | Email briefing |
| `/api/telegram/heartbeat` | 19:30 | 7:30am | **The daily digest.** Full sweep, always sends |
| `/api/business-health/refresh` | 20:00 | 8:00am | Cached business-health figures |
| `/api/portal-reminders` | 22:00 | 10:00am | Nudges clients sitting on deliveries |
| `/api/telegram/brain-tick` | 02:00 | 2:00pm | Afternoon safety net, silent unless something is due |
| `/api/health/integrations` | every 30m | — | Xero/IMAP connectivity into `integration_status` |

## Why there used to be seven brain ticks a day

`brain-tick` ran at 20, 22, 0, 2, 4, 6 and 8 UTC. Each run re-read the whole
CRM to work out whether anything had changed since the last one. That is
polling for events, and it was bad at both halves of the job:

- Most runs found nothing, because most of a day contains nothing. Six of the
  seven ran between 8am and 8pm NZ, several of them while Arlo was in class.
- The moments that actually matter — a client requesting changes, a proposal
  coming back accepted — waited up to four hours to be noticed, which is
  precisely what a proactive assistant is supposed to prevent.

Those moments are now **pushed**. The server action that handles the client's
click calls `emitAssistantEvent` (`lib/tui/events.ts`), which records a flag
and, for urgent events, wakes one assistant turn immediately via
`/api/telegram/event`. Nothing is on the visitor's critical path — it all runs
inside `after()`.

What remains on a timer is only what genuinely accrues with time rather than
with events: an invoice crossing its due date, a lead going quiet, a job
sitting untouched. That is what the 7:30am digest and the single 2pm safety
net are for, and `assistant_flags` means neither can repeat itself.

`/api/business-health/refresh` also lost a duplicate: it was scheduled at both
20:00 and 21:00 UTC, doing identical work an hour apart.

## Auth

Every cron route requires `Authorization: Bearer $CRON_SECRET`, which Vercel
sends automatically. `/api/telegram/event` uses the same secret — it is called
server-to-server from `after()`, never from a browser.
