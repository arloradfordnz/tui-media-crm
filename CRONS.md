# Schedules

All times are UTC, because that is what Vercel cron takes. NZ is UTC+12 (+13 in
daylight saving), so the offsets below are what actually matters.

| Route | UTC | NZ | What it is |
|---|---|---|---|
| `/api/morning-briefing` | 19:00 | 7:00am | Email briefing |
| `/api/business-health/refresh` | 20:00 | 8:00am | Cached business-health figures |
| `/api/portal-reminders` | 22:00 | 10:00am | Nudges clients sitting on deliveries |
| `/api/health/integrations` | 19:15 | 7:15am | Xero/IMAP connectivity, and the only thing that texts unprompted |

**Nothing on this list texts you on a schedule.** `/api/health/integrations`
writes `integration_status` every day, but only sends a message when an
integration *changes* state — working to broken, or back again. A month of
everything being fine is a month of silence.

## Why the daily Telegram digest is gone

There were two proactive Telegram crons: `heartbeat`, which always sent
something, and `brain-tick`, which sent when a flag was due. Between them, one
week in August looked like this:

    Aug 19  all three retainers have no August content
    Aug 20  one week since this was flagged and nothing's moved
    Aug 22  August's two thirds gone, still zero jobs, 9 videos
    Aug 23  Still no August job for Johnson, Bainbridge or Framers
    Aug 24  Same story as last week... I'll stop repeating myself
    Aug 25  still no August job for Johnson, Bainbridge or Framers

Three separate faults. The dedup marked a flag notified, but the flag re-fired
because the condition was still true — "still true" is not "still news". There
was no way for Arlo to say "I know, drop it", so it chased August content into
September. And it kept naming a client who had been dropped a month earlier.

Arlo never replied to any of it. In a month there is not one inbound Telegram
turn. A channel that talks every day whether or not it has news gets muted, and
then it cannot deliver the message that mattered.

So Telegram now speaks for exactly two reasons: he messaged it, or a client did
something in the portal (`/api/telegram/event`, fired by `emitAssistantEvent`).
Outage detection, which was the honest half of the heartbeat, moved to the
health cron as an edge trigger.

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

## The Hobby plan only allows DAILY crons

This is a hard deployment gate, not a soft limit. A schedule that would fire
more than once a day — `*/30 * * * *`, `0 * * * *` — **fails the Vercel build**
with "Hobby accounts are limited to daily cron jobs", and the whole deploy is
rejected. Nothing ships, including the parts that have nothing to do with cron.

That is how the health check was written first, at every thirty minutes, and it
is why it now runs once a day at 19:15 UTC — a quarter hour ahead of the
heartbeat, so the daily digest reads connectivity that was checked minutes
before rather than a day before. That is the moment it actually matters.

If something genuinely needs to run several times a day on this plan, list the
same path more than once at different daily times. The config before this
branch did exactly that for brain-tick, at 21:00, 01:00 and 04:00.

## Auth

Every cron route requires `Authorization: Bearer $CRON_SECRET`, which Vercel
sends automatically. `/api/telegram/event` uses the same secret — it is called
server-to-server from `after()`, never from a browser.
