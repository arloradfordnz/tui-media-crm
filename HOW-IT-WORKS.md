# How the CRM works

Written for you, not for a developer. Every section says what the thing is for,
and where it gets its numbers from, because most of the mistakes in here have
been the app confidently showing a figure it had made up.

---

## Tui, the assistant

**What it is.** One assistant with one memory, reachable in three places:

- **Telegram** — you can text it, and it texts you when a client does
  something or an integration breaks. It never sends anything on a schedule;
  see CRONS.md for why.
- **The Today screen** — the panel at the bottom of the home page.
- **`/dashboard/tui`** — the centre tab on your phone, or ⌘K on a desktop.

All three are the same conversation. Say something on Telegram and it is there
in the dashboard panel; ask something in the panel and Telegram knows you
already discussed it. Before this branch they were two separate assistants with
separate histories, which is why it used to repeat itself.

**What you need it for.** Three things it does that nothing else in the app
does:

1. **It notices things without being asked.** It reads the CRM and texts you
   only if something needs you: a retainer month
   you still owe videos on, a job that has sat untouched, an invoice gone
   overdue, a lead that has gone quiet, a shoot in a few days with nothing
   organised. If there is nothing, it says nothing.
2. **It does the work, not just the reporting.** It has real tools. "Push Smith
   to Friday", "invoice Greg 600", "create July Content for Bainbridge" — it
   makes the change in the CRM or in Xero, and tells you it did.
3. **It answers from real data.** "How far behind am I?" counts videos actually
   uploaded to the client portal, not job statuses, because statuses go stale
   and lie.

**What stops it going wrong.** Anything destructive — voiding or deleting a
Xero invoice, removing a payment, deleting a job — is refused by the code
before the model ever runs it. On the dashboard you get a Confirm button; over
Telegram it sends you a four-character code and only that exact code, typed
back, releases that one action. The permission is tied to the specific
arguments, so confirming one deletion cannot be reused for a different one.

**Why it does not nag.** Every concern it can see gets a row in a table with a
stable identity — "this job is stalled", "Bainbridge owes three from July".
Once it has raised something it will not raise it again for a day, then three
days, then a week, then a fortnight. Tell it to leave something alone and that
becomes a real snooze rather than a promise it forgets.

**If it says it is out of credit**, that is the Anthropic account, not a bug.
It will tell you so in those words rather than "something went wrong".

---

## The Monday briefing

One email a week, Monday morning, to hello@tuimedia.nz. It is the week's
setup: what to lead with, the seven days of shoots, where the money sits, and
any client revision still waiting on you.

It used to arrive every morning. Six of those seven were the same mail with a
different date on it, because the figures move monthly and the shoot calendar
is fixed weeks ahead — so it went the way of the daily Telegram digest, for
the same reason. CRONS.md has the detail.

The "One to know" Hacker News item is gone with it. It was the one part of the
mail with nothing to do with the business.

---

## Today (the home screen)

Answers "what do I do now", not "how is the business doing".

- **Today** — what is actually on today, or an honest empty state.
- **Needs you** — at most six things, worst first. Each row has one action.
- **Tui** — the panel described above.

Revenue is deliberately not here. It is a monthly artefact, it costs a click
(**Insights**), and having it here meant the page you open most often waited on
Xero before it could draw anything.

---

## Jobs

The list reflows on a narrow screen instead of scrolling sideways, so you keep
the shoot date, client, value and status on a phone.

A job record is four tabs:

- **Work** — the details, and the task checklist.
- **Deliverables** — the videos and their uploaded versions, and revision rounds.
- **Money** — the proposal, and time tracking.
- **Activity** — the log.

**Booking a shoot now puts it on the calendar.** Setting a shoot date creates a
calendar event and moving the date moves it. Clearing the date removes it.
Shoots booked before this shipped need `supabase/backfill_shoot_events.sql` run
once.

---

## Video ad projects

The job type the business now sells. Picking **Video Ad Project** on a new job
seeds the checklist for the whole thing:

**Strategise → Script → Film → Edit → Launch & manage → Handover**

The Work tab grows a **Campaign** block on these jobs and only these jobs — a
wedding has no ad account, and six empty campaign fields on every old job would
bury the ones that matter.

**The managed month is the deadline that costs money.** The project fee buys one
month of running the ads. Set **Campaign launched** and, if you leave **Managed
until** blank, it fills in a month later on its own. From then on the job says
in words where it is: live, a week out, ends today, or *N days over*. Past the
end date with nothing handed over, it turns up on the home screen as urgent,
because every day past it is work being done for free.

**Handover is the end of the job.** Ad account, raw footage, final cuts. Fill in
**Handed over** and the job stops asking.

**Their ad spend is not your revenue.** The Campaign block records what the
client spends on media, which they pay the platform directly. It is kept out of
the quote, out of lifetime value and out of every figure on Money and Finance.
It is there so you know the size of what you are running, not because it is
yours.

**Retainers have not gone anywhere.** The clients still on monthly retainers stay
on them, keep their `retainer` category, and keep showing up on the Retainers
page, until you give them notice. Video ads is a category alongside those, not a
replacement for them.

---

## Where an enquiry goes

The application form on tuimedia.nz asks what they sell, what a customer is
worth, what they will spend, who signs it off and whether they could handle more
work. That is the information that decides whether a lead is worth a call.

It now lands in two places: the email to hello@tuimedia.nz, as before, and a
client record with **Client type: Video Ads**, the answers filled into the
**Application** block on the Details tab, and the raw wording kept in the notes.
Applying twice updates the existing record instead of making a second one, and
an existing client applying again is not knocked back to "lead".

The email is sent first and the CRM write is allowed to fail. If the CRM is down
mid-deploy the enquiry still reaches you; it just needs entering by hand.

Two settings make this work, and it does nothing until both are set:

| Where | Variable | Value |
| --- | --- | --- |
| CRM (Vercel) | `ENQUIRY_SECRET` | any long random string |
| Rebrand site (Vercel) | `CRM_ENQUIRY_SECRET` | the same string |
| Rebrand site (Vercel) | `CRM_ENQUIRY_URL` | `https://<crm-domain>/api/enquiry` |

Without `ENQUIRY_SECRET` the endpoint refuses everything, which is the right
failure: it writes to the clients table with the service-role key, so the secret
is the only thing between the form and someone filling the CRM with junk.

---

## Money vs Finance

Two pages, deliberately.

- **Money** is operational: which invoices are unpaid, how late, who to chase.
  A list you work down, sorted by lateness. Read-only — raising and voicing
  invoices stays in Xero or goes through Tui, which has a confirm gate.
- **Finance** is analytical: money in against money out over time, cash and
  runway, who paid the most.

**Where Finance gets its numbers.** Xero's own cash-basis profit and loss. This
matters, because it used to add up every bill plus every "spend money" line in
your bank feed, and a spend line is *any* money leaving the account —
transfers, drawings, personal card spending, anything coded to a non-expense
account. It reported $21,314 of spending against a real figure of $4,148 and
turned an $11,433 profit into a $5,831 loss. It now agrees with Xero to the
dollar.

"Cash basis" means money that has actually moved. Invoices you have raised but
not been paid for are on Money, not here.

Click **Money in** or **Money out** to read one line on its own.

---

## Retainers

How far behind you are, measured by **videos actually uploaded to the client
portal**. Not job status, which gets set once and goes stale, and not the
deliverable "completed" checkbox, which is false on every row including months
that shipped in full.

A month with no job at all is the worst case, not a clean slate: it means the
month was never set up, so every video for it is outstanding.

---

## Documents

Fill the form, press **Download PDF** or **Email to Client**.

The AI button in the corner of the content box drafts the body from the fields
above it. It knows how you actually work: project fees rather than retainers,
not an agency, the strategise/script/film/edit/launch process, the one-month
managed campaign priced into the fee, the handover of raw footage and final
cuts and the ad account at the end, no guarantees, ad spend paid straight to
the platform. It writes in your voice — no em dashes, never "storytelling",
"video ads" rather than "video marketing".

Where a real figure is needed and you have not given one it leaves a
placeholder like `[project fee]`. A made-up price in a contract is worse than
a blank.

---

## The client portal

What the client sees. Forced dark, its own metadata, the delivery is the first
thing on the page rather than buried under status.

Approving, requesting changes, accepting or declining a proposal now **tells
Tui immediately** rather than waiting for the next scheduled check. That is
the difference between hearing about a revision request in ten seconds and
hearing about it in four hours.

Signatures record the IP and timestamp, and show them, so the signature is
defensible rather than decorative.

---

## Things that need you

- **Four SQL files** in `supabase/` still need running once in Supabase:
  `migration_assistant_flags.sql`, `migration_agent_ticks_event.sql`,
  `backfill_shoot_events.sql`, and now `migration_admin_allowlist.sql`. Until
  the first two run, Tui will repeat itself and its own audit log stays empty.
  The last one closes the sign-up hole described under the client portal, and
  is the urgent one.
- **Two Supabase console settings**, also under the client portal below: turn
  public sign-up off, and point the redirect URLs at dashboard.tuimedia.nz
  instead of localhost.
- **Anthropic credit** is what Tui thinks with. When it runs out, Tui says so.

---

## Where the numbers come from, in one table

| Figure | Source | Not |
|---|---|---|
| Money in / out, net profit | Xero cash-basis P&L | Bank feed lines |
| Outstanding and overdue | Xero invoices | The CRM |
| Videos owed | Files uploaded to the portal | Job status |
| Runway | Bank balance ÷ average of the last six whole months | Including the part-month you are in |
| Revenue on Insights | Xero, falling back to delivered jobs in the CRM | — |

## Client portal accounts

Clients now have two ways in, and both still work:

- **The emailed link** — `/portal/client/<token>`. The unguessable token in the
  URL is the auth. Every delivery email ever sent carries one of these, so it
  is not going anywhere.
- **An account** — `/portal/login`, then `/portal/me`. Email and password.

To give a client an account, open their record and press **Send account
setup**. That creates the account, emails them a link to choose a password,
and records the date. Pressing it again re-sends — it does not make a second
account, so it is also the fix when someone lets the 24-hour link lapse. The
button only appears once the client has an email address on file.

An account exists because Arlo made one. **Public sign-up is still switched on
at the Supabase project, though, and that is a hole — see below.**

### Why the security model changed

Client accounts live in the same Supabase Auth project as Arlo's admin login,
so `authenticated` stopped meaning "Arlo". Three things enforce the split, and
they are deliberately independent of each other:

1. **The database.** Every RLS policy now carries `public.is_admin()`, which is
   false for any user whose `app_metadata.role` is `client`. `app_metadata` is
   writable only by the service role. This is the real lock — a client who got
   past everything else would still read nothing.
2. **The API.** `getAuthUser()` returns `null` for client accounts, so every
   route that guards on it treats a client as signed out.
3. **The routing.** Middleware sends each kind of account to its own front
   door, and `app/dashboard/layout.tsx` re-checks the role against the auth
   server rather than the cookie.

The portal resolves *which* client someone may see from the `client_users`
table, never from a claim in their token.

Run `supabase/migration_client_accounts.sql` before any of this works.

### The two settings that still need you, in the Supabase dashboard

Checked on 6 September 2026. Both are console settings, so neither can be fixed
from the codebase.

**0. If the CRM ever looks empty, nothing has been deleted.**

This happened once, on 6 September 2026, and it is worth knowing the shape of
it. `is_admin()` reads your role out of your **login token**, and a token is a
snapshot from the moment you signed in. The role was granted the day after that
session started, so the browser was still presenting a token with no role. Every
policy denied it: no clients, no jobs, and "new row violates row-level security
policy" on anything you tried to create. The database was untouched the whole
time — all 39 clients were exactly where they had always been.

The app now repairs this by itself in `proxy.ts`, and if it cannot, it sends you
to the login page with an explanation rather than showing you an empty CRM.
**Signing out and back in is always the fix.** If a screen ever looks emptier
than it should, do that before anything else.

**1. Public sign-up is on, and a self-registered account reads everything.**

`is_admin()` was written as a deny-list — "everyone except a client is an
admin". A user who signs themselves up has no role at all, so they are not a
client, so they are an admin. Proven by creating a confirmed account with no
role and reading through the *public* anon key: clients, jobs, documents and
email_logs all returned rows. The only barrier is owning an email address you
can confirm.

Two things fix it, and both are needed:

- In **Authentication → Sign In / Providers**, turn **Allow new users to sign
  up** off. Nothing in the app uses it: clients are created by the
  "Send account setup" button, and there is only one admin.
- Run **`supabase/migration_admin_allowlist.sql`**, which flips `is_admin()` to
  an allow-list (`role = 'admin'`) so nothing is ever admitted on the absence
  of a role again. Both of Arlo's accounts have already been stamped
  `role: 'admin'`, so the flip does not lock him out — and the migration
  refuses to run if it would.

**2. Account setup emails point at localhost.**

`generateLink()` asks Supabase to redirect to
`https://dashboard.tuimedia.nz/portal/auth/callback`. That URL is not in the
project's redirect allow-list, so Supabase silently ignores it and falls back
to the Site URL, which is still the default `http://localhost:3000`. Every
"Send account setup" email therefore hands the client a link that verifies
correctly and then drops them on a dead address on their own machine. They can
never reach `/portal/setup`, so they can never choose a password.

In **Authentication → URL Configuration**, set the **Site URL** to
`https://dashboard.tuimedia.nz` and add `https://dashboard.tuimedia.nz/**` to
**Redirect URLs**. Nothing in the code changes.

Email and password login itself is fine — that path was verified end to end on
6 September and is not affected by either of these.
