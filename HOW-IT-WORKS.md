# How the CRM works

Written for you, not for a developer. Every section says what the thing is for,
and where it gets its numbers from, because most of the mistakes in here have
been the app confidently showing a figure it had made up.

---

## Tui, the assistant

**What it is.** One assistant, reachable in two places:

- **The Today screen** — the Assistant box on the home page. It starts fresh
  on every visit.
- **`/dashboard/tui`** — Assistant in the menu (or the robot button on your
  phone), or ⌘K on a desktop. This one keeps the day's conversation and starts
  a new one after 24 hours. What it should know for good lives in Settings,
  under Memory.

Telegram was removed in November 2026; it was not being used.

**What you need it for.** Three things it does that nothing else in the app
does:

1. **It knows what needs you.** Client actions in the portal and things like a
   retainer month you still owe videos on, a job that has sat untouched or a
   lead gone quiet show up in Your week on the Today screen.
2. **It does the work, not just the reporting.** It has real tools. "Push Smith
   to Friday", "invoice Greg 600", "create July Content for Bainbridge" — it
   makes the change in the CRM or in Xero, and tells you it did.
3. **It answers from real data.** "How far behind am I?" counts videos actually
   uploaded to the client portal, not job statuses, because statuses go stale
   and lie.

**What stops it going wrong.** Anything destructive — voiding or deleting a
Xero invoice, removing a payment, deleting a job — is refused by the code
before the model ever runs it. You get a Confirm button, and only that tap
releases that one action. The permission is tied to the specific
arguments, so confirming one deletion cannot be reused for a different one.

**Why it does not nag.** Every concern it can see gets a row in a table with a
stable identity — "this job is stalled", "Bainbridge owes three from July".
Once it has raised something it will not raise it again for a day, then three
days, then a week, then a fortnight. Tell it to leave something alone and that
becomes a real snooze rather than a promise it forgets.

**It can search the web when you ask it to.** "Look up Johnson Residential",
"google Sky Automotive", "what do Team Bainbridge do": it checks the CRM first,
then searches, and tells you what it found and where. Searches are weighted to
Nelson so a local business comes up before a namesake overseas. It never
searches on its own, never on a portal event, and never changes the CRM
because of something it found unless you ask. On the dashboard each search
shows a receipt like any other tool. Up to five searches per question; each
search costs about 1.5 cents on the Anthropic account.

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

## Client emails in Your week

Mail from a client shows up on the dashboard as a line about that client, e.g.
*Marty's Meat Smash wants to move Thursday's shoot*, rather than a generic
"unread email".

Opening the dashboard triggers `lib/client-mail.ts` after the page has
rendered (at most once every five minutes). It reads the last 60 inbox
messages over IMAP, keeps the ones sent from a client's `email` or
`marketing_email` (or, failing that, a company domain only that client uses —
never Gmail and friends), and has Haiku write the heading and a two-sentence
summary for each new one. Only those are stored in `client_emails`; **the body
is never saved**, and nothing is marked as read. Reply to the client from Apple
Mail and the row leaves Your week on the next sync; anything older than ten
days drops off regardless. Thank-yous and FYIs are filed but not shown.

Mail from someone who is not on a client record is ignored. If a client writes
from a new address, add it to their record. `POST /api/client-mail/sync`
(signed in, or `Bearer CRON_SECRET`) forces a sync past the throttle.

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

**Your iPhone work calendar comes in too.** Paste the Public Calendar link from
the phone into **Settings → iPhone calendar** and those events appear on the
calendar page, Today and in Tui, refreshed within about five minutes of you
opening the CRM or texting Tui. It only reads: edit on the phone, and an event
deleted on the phone disappears here. They are marked iPhone, can't be deleted
from the CRM, and are left out of the CRM's own calendar feed so they don't
come back onto the phone twice. Clearing the link switches it off and removes
them. Anyone with that link can see the calendar, so use the work one.

**And the other way: CRM events go onto the phone's work calendar.** In
**Settings → Send CRM events to your phone**, enter your Apple ID and an
app-specific password (made at account.apple.com under Sign-In and Security;
it can only reach Calendar and can be revoked there), then pick the work
calendar. Shoots and anything added in the CRM or by Tui are written into it,
kept in step when they change, and removed when they are deleted, so you only
need that one calendar and can drop the "Tui Media" subscription. It runs on the
same five-minute rhythm as the read side. The password is stored where only the
server can read it and is never shown again. Disconnecting takes everything it
wrote off the phone. If a sync fails (a revoked password, say) the card says why.
Shoots booked before this shipped need `supabase/backfill_shoot_events.sql` run
once.

---

## Shoot pack

Every shoot in the calendar has a **Shoot pack** (the chip on the event, or
the row on Today from 3pm the day before until the shoot is over). One page
with when, the address (opens Apple Maps), the contact with a tap-to-call
number, what you're making, the brief, the client's last few emails, and the
shoot-day tasks still open.

**Write shot list** has Claude write one from all of that, grouped by video,
with a short "Don't forget" for things the notes mention. It is saved on the
shoot, so it's there in the morning without waiting, and **Edit** changes it
by hand. It only uses what the CRM knows, so a thin brief gives a general list.

---

## Instagram, two posts a week

Tui Media's own Instagram gets two slots a week, **Tuesday and Friday**, shown
in green on the calendar (worked out each time, not stored, so they never land
on the phone). There's no Instagram connection, so on a slot day Today shows
"Tui Media Instagram post due today"; tap the tick (**Posted it**) once it's up.
A slot passed with nothing logged turns into "Missed Tuesday's Tui Media
Instagram post". Posts count for the week, so two on Monday cover both slots
and a Wednesday post covers Tuesday. The days are in `lib/instagram-slots.ts`.

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

### Wedding enquiries from arloradford.nz

The wedding form on arloradford.nz still emails arloradford.nz@gmail.com, and
now also lands here. The CRM reads the date ("14 February 2027", "14/2/27"),
checks the calendar for that day, makes the couple a client (Weddings, lead, brand Arlo Radford) and
a "<names> Wedding" job as an enquiry, and drafts the reply: whether you're
free, the three packages with prices, $500 to hold the date, and two
after-school times to meet. Today shows it at the top as "New wedding enquiry:
Sam & Alex, Saturday 14 February 2027 (date is free)" with a **Reply** button
that opens the draft in Mail to read and send. The row goes once the client's
pipeline moves past enquiry, or with Done.

Prices in the draft live in `lib/wedding-enquiry.ts`; change them there and in
the playbook together. Commercial enquiries from the same site are filed as a
lead with no draft.

The arloradford Vercel project needs `CRM_ENQUIRY_URL`
(`https://dashboard.tuimedia.nz/api/enquiry`) and `CRM_ENQUIRY_SECRET` (the
same value as the CRM's `ENQUIRY_SECRET`). Without them the site only emails.

---

## Leads

**Leads** in the menu is the cold and warm list from hello@tuimedia.nz, not
the CRM's clients. It reads the folders under **02 Leads** (Cold, Warm and the
named sub-folders) and the pitches in Sent ("Locally filmed video ads for X?",
"More enquiries for X?", "More bookings for X?"), one row per email address.
Filing an email into Cold or Warm is what puts a lead there.

| Section | Means |
|---|---|
| Reply | They wrote last and nothing has gone back |
| Nudge | A week or more since you last wrote, warm first, then cold, then pitches |
| Later | You pressed 1 wk or 1 mo; back on that date |
| Gone quiet | Three emails with no reply, or nothing either way for 3 months |
| Dropped | You pressed ✕. Bring back undoes it |

**Draft nudge** reads the last couple of emails each way and writes a short
follow-up in your voice (Claude Haiku). **Open in Mail** opens it as a reply to
check and send; **Sent it** moves the row on straight away. The mailbox is read
in the background when the page is opened and the last read is over an hour
old, or now with **Check mail**. Today shows one row with how many are waiting
on a reply and how many are due a nudge. Someone who becomes an active client
drops off the board on their own.

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

**Pausing a retainer.** Set **Retainer paused from** on the client's Details
tab to the first month they don't owe. From that month on nothing is counted,
the client shows as Paused, and Tui stops chasing it. Clear the field to
resume. Team Bainbridge is paused from August 2026.

**Months set themselves up.** Early each morning the CRM makes the current
month's content job ("December Content") for every active retainer that isn't
paused, with one deliverable per video owed (none for an open-ended one). A
month that already has a job is left alone, and each client is done once a
month, so deleting a month's job (a skipped month) keeps it deleted. A client
with no videos per month on their record is skipped, and Today says so.

It does not make invoices. Xero's repeating invoices already bill retainers on
the 1st, so a CRM invoice would bill them twice. Instead it reads those repeating
invoices and puts a row on Today when a retainer has none, when Xero's amount
differs from the client's monthly retainer, or when one is still running for a
client that is paused or no longer active. Extras (a site visit, hourly work)
still go on that month's invoice by hand or through Tui.

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

**Contracts are fixed terms plus a summary (since 3.45.0).** Every contract is
the same approved wording, `lib/contract-terms.ts` (terms version 1, written
from `contracts/contract-terms-v1.md`), with three variants of the cancelling,
ending and liability clauses: monthly, one-off, and event or wedding. Only the
"At a glance" summary on top changes per client, filled from your answers to
the popup by Sonnet in a few seconds. The contract says the summary wins over
the terms, so a one-off change (3 revision rounds for one client) goes under
"Anything else agreed". Changing a contract later edits the summary and
rebuilds it, so the terms never change. Before saving, the CRM checks the fee,
the legal name, who signs, and that a deposit is no more than half the fee.
Changing a term for everyone means a new terms version, not an edit, so every
saved contract records which version it used. Contracts made before 3.45.0
still edit the old way.

**Contracts: legal name and the fixed terms.** When Tui asks the contract
questions, the popup searches the NZ Companies Register for the client in the
background, while you answer the earlier questions. The legal-name question is
near the end and is a confirmation: tap the company it found ("Company:
Johnson Residential Limited", saved as a company) or the sole trader line
("Sole trader: Sam Johnson trading as Johnson Residential") when there is no
company by that name. Type your own if neither is right. It only asks when the
client record has no legal name yet.

These are the same in every contract and are no longer asked: the client owns
the videos once paid in full, Tui Media may show the work in its portfolio, 2
revision rounds per video, invoices due 7 days after they are sent, and Tui
Media keeps the deposit if the client cancels (a postponed event moves it to
the new date once). If Tui Media cancels, the deposit is refunded. Anything
different goes under "anything unusual" and overrides the default for that deal.
Xero's repeating retainer invoices are set to 14 days, so change those to 7
if you want them to match.

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

**Approved videos can go straight to their marketing person.** Put an address
in **Marketing Email** on the client's Details tab (only Johnson Residential has
one) and the first time a cut is approved, that person is emailed a download
link. The link opens that one file, not the portal, and works until the file
is archived at two months. Leave the field empty and nothing extra is sent.

### Which name the client sees

Each client has a **Brand** on their Details tab: Tui Media (social content,
events) or Arlo Radford (weddings, testimonials, brand films, commercial).
Arlo Radford clients see Arlo's name and wordmark instead of Tui Media's across
the portal and its sign-in pages, every client email (the sender name changes,
the address does not), document and proposal PDFs, the proposal page, and the
signature block. Wherever price or payment comes up they also get one line:
invoices are issued by Tui Media, Arlo's business name for invoicing. Nothing
changes for Tui Media clients, and billing stays on the Tui Media Xero account.

A job can override its client's brand (`jobs.brand`, empty means "same as the
client"); there is no field for it yet. Enquiries from arloradford.nz come in as
Arlo Radford. Everything lives in `lib/brand.ts`, including
`contractPartyLine()` for the contract rewrite. The sign-in pages come before a
login, so emailed links carry `?brand=arlo_radford`; a client who types the
plain address sees Tui Media there until they sign in.

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
account, so it is also the fix when someone lets the link lapse (they can also
press **Forgot your password?** themselves). The
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

### Security audit, 13 October 2026

Found and fixed, all verified from outside with the public anon key and with
disposable client and role-less accounts:

- **The old Prisma tables were world-readable.** `"User"` (with a `password`
  column), `"Client"`, `"Proposal"` and the rest of the PascalCase tables had
  row level security off, so anyone could read them with no login. They are now
  locked (deny-all), not dropped. **If the password in `"User"` was ever one
  you still use, change it** — it was readable until today. The tables can be
  dropped once you are sure nothing in them is needed.
- **A client account could read and write `app_settings`**, which holds the
  iCloud calendar settings. Now admin only.
- **A client account could call the Xero connect/disconnect routes and the
  iCloud, calendar and settings server actions**, all of which run with the
  service role. Those guards now require `role = 'admin'`, and so does
  `getAuthUser()` for every other API route (it used to refuse only clients, so
  an account with no role at all got through).
- **`anon` held every privilege on every table**, including TRUNCATE, which RLS
  does not cover. It now has none, and `authenticated` lost TRUNCATE, TRIGGER
  and REFERENCES. Future tables inherit that.
- **Cron and webhook secrets were compared with `===`.** They now use a
  constant-time comparison (`lib/secure-compare.ts`).
- **Security headers** on every response: no framing, no MIME sniffing, HSTS, a
  strict referrer policy (portal and proposal links carry their secret in the
  URL), and `noindex` plus no-store on the portal, proposals and dashboard.
- **Next.js was upgraded 16.2.2 to 16.4.0** to close proxy/middleware bypass,
  server action and image-optimiser vulnerabilities.
- **Passwords are checked.** A live strength meter on both password forms, and
  the server enforces the same rules (10+ characters, no common passwords or
  patterns, not containing the email or name) plus a lookup against known
  breaches that never sends the password anywhere (`lib/pwned.ts`).

Still open, and only you can do it:

- **Turn off "Allow new users to sign up"** in Authentication → Sign In /
  Providers. A database trigger cannot do it: Supabase creates invited users the
  same way (the role is stamped afterwards), so a trigger blocks "Send account
  setup" too — that was tried and removed. Until the switch is off a stray
  account is harmless (no role means no access anywhere), but it can still send
  confirmation emails from your domain.
- In the same place, set **minimum password length to 10** and switch on
  **leaked password protection** if the plan allows it, so the rules also hold
  for Supabase's own reset flow.
- One moderate advisory remains in `@anthropic-ai/sdk`; fixing it needs a
  breaking upgrade.

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

**2. Account setup emails used to point at localhost. Fixed in code, 13 October 2026.**

The email used to carry Supabase's own link, which redirected to the project's
Site URL (still `http://localhost:3000`) and, even with that right, delivered
the session in a `#hash` the server could never read. The email now links
straight to `/portal/setup?token=…` on this domain and the token is exchanged
when the client presses **Save**, so neither the Site URL nor the redirect
allow-list matters any more. Setting the Site URL to
`https://dashboard.tuimedia.nz` is still tidy, but nothing depends on it.

Clients can also reset their own password from **Forgot your password?** on
`/portal/login`, and change it from the portal once signed in.

Setup link, sign-in, change password, sign-out and a spent link were verified
end to end on 13 October 2026.
