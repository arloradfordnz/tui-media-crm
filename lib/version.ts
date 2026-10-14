// Bump this on every deploy. Uses semver (MAJOR.MINOR.PATCH).
// - PATCH: small fixes, tweaks, copy changes
// - MINOR: new features (e.g. R2 deliverables, new sections)
// - MAJOR: breaking changes or a visible overhaul
//
// Keep it in step with package.json — the two had drifted (2.0.0 here against
// 2.1.0 there), so the number shown in Settings was not the number shipped.
//
// 3.0.0 — the mobile and assistant overhaul. Bottom tab bar and a reflowing
// record layout, light mode removed, Tui unified into one thread across
// Telegram and every dashboard surface with visible tool receipts and real
// notification state, event-driven triggers in place of seven daily crons, the
// job record split into tabs, a Money page, and Finance rebuilt around one
// chart. Enough visibly changed that a returning user has to relearn the app.
//
// 3.0.1 — Subscriptions card on the dashboard, under Money.
// 3.0.2 — Xero's $28.18 added to the subscriptions total.
// 3.1.0 — Retainers can be paused (Bainbridge from August), and approved
// videos can be emailed straight to a client's marketing contact.
// 3.2.0 — iPhone work calendar synced into the CRM; Industry and the time
// tracker's Category now use the custom dropdown.
// 3.3.0 — CRM events are written into the iPhone work calendar over CalDAV, so
// the phone needs only one calendar.
// 3.3.1 — iCloud writes made one at a time with retries; parallel PUTs got 500s.
// 3.4.0 — Tui can search the web when asked, mainly to look up clients.
// 3.4.1 — web searches animate while they run (a sweeping magnifier and a
// shimmering label), start the moment the search does, and show the query and
// result count when done.
// 3.5.0 — unanswered client revision requests appear in Your week on the
// dashboard, linking straight to the revision to accept, decline or reply.
// 3.5.1 — those rows name the client, job and deliverable; the retainer row
// names who is owed; Tui's links land under the last bubble of a turn.
// 3.6.0 — client emails are read from the inbox, matched to the client by
// sender, and summarised into a tailored line in Your week ("Marty's Meat
// Smash wants to move Thursday's shoot"), clearing once you reply.
// 3.6.1 — phone pass: no more sideways scrolling (a hidden panel was parked
// off the right edge), tighter mobile spacing, and Add to Home Screen opens
// full screen with the favicon's bird as the app icon.
// 3.7.0 — the phone tab bar is a floating liquid-glass capsule (Today, Jobs,
// Retainers, Settings) with a sliding highlight, and Tui AI is its own round
// glass button beside it.
// 3.7.1 — the tab bar's highlight can be pressed and dragged like iOS 26
// glass, and focusing a field (the Tui message box) no longer zooms the page.
// 3.8.0 — Tui: a dropped connection no longer wipes the reply or says "try
// again" after work saved (it keeps the receipts and says what went through),
// the server finishes a turn even if the phone disconnects, and creating a
// client twice is guarded. Booking a new client's job is one call with the
// status, notes and agreed price read from the email thread, template tasks
// insert in one batch, and the dashboard chat runs on Claude Haiku 5.5.
// 3.9.0 — the dashboard's money graph moves under Tui and stretches so both
// columns finish level; subscriptions move into a table and Tui can add,
// change and cancel them.
// 3.10.0 — the contract PDF is redesigned (white, black and white only, the
// website logo and font, one heading size), and the default contract wording
// is a saved template that can be edited in Documents or by Tui, which can
// also create and edit contracts.
// 3.10.1 — a Transactions card (the same as Finance's) under the dashboard
// money chart, the two sharing the left column's spare height; Xero token
// expiry is read from the token itself, and a failed Xero transactions fetch no
// longer caches as "no transactions".
// 3.10.2 — the transactions go back inside the money card, under the chart,
// and the two share the card's spare height.
// 3.11.0 — contracts are drafted fresh for each deal by a dedicated drafter on
// Claude Opus 5.5 with a New Zealand legal brief, instead of the default
// template being filled in every time. Tui reads the client first, then asks
// the deciding questions as a tap-to-answer popup; changes revise the same
// contract. The AI button in Documents is gone, and the chat's scroll bar no
// longer runs past the card's rounded corners.
// 3.11.1 — picking an answer in Tui's question popup only selects it; Next and
// Send answers move on. Questions are told to name the client and quote the
// real figures, with options that are final answers.
// 3.11.2 — the tab bar's highlight moves the moment a tab is tapped instead of
// waiting for the next page, and can no longer get stuck lifted after an odd
// touch.
// 3.11.3 — the question popup's selected answer is one accent outline, like a
// focused message field, instead of the focus ring stacked on the selection.
// 3.12.0 — client account setup emails work: they link to /portal/setup on
// this domain instead of Supabase's redirect (which landed on localhost), and
// the link survives mail scanners. Clients can reset a forgotten password and
// change it from the portal.
// 3.12.1 — contract PDFs repeat the separator under the date on every page.
// 3.13.0 — security pass. The old Prisma tables are locked (they were readable
// without a login), client accounts can no longer reach admin actions or
// settings, anon database privileges are gone, secrets compare in constant
// time, security headers are on, Next.js is patched (16.4.0), and passwords get
// a live strength meter plus server-side strength and breach checks.
// 3.14.0 — deleting a client is checked and removes their portal login too;
// the Application card asks the same questions, with the same dropdown answers,
// as the form on tuimedia.nz; Tui's thinking and search animations are redone,
// and empty results no longer say "0 jobs". start-dev.sh points at the right
// folder.
// 3.15.0 — contracts are shorter (3 to 4 pages) and written for each project,
// with Arlo's rules built in: rollover only when Tui Media or the weather
// cancels, 14 days' notice to end, no deposit on monthly work, delivery and
// feedback through the client portal, and stated defaults instead of blanks.
// The contract names the client's legal entity and main contact; Tui asks for
// anything the client record is missing (no question limit, typed answers
// allowed) and saves it. The manual contract maker and template are gone.
// 3.15.1 — contract PDF: the gap under the header rule is the same on every
// page, not just the ones that open with a heading.
// 3.15.2 — Tui's working text has a real light passing through it: a bright,
// softly glowing band sweeps across the label and rests, instead of a
// gradient that flickered past.
// 3.15.3 — contract questions: Tui is told what every contract already
// decides (notice, rollover, deposits, turnaround, invoicing and the rest) and
// stops asking about them; any number of questions, with follow-ups when an
// answer is unclear or "I don't know".
// 3.15.4 — contracts open with an "At a glance" summary of the whole deal,
// then 8 short plain sections: about 4 pages with the cover instead of 7,
// keeping every clause that actually protects Tui Media.
// 3.16.0 — Tui keeps working when you change page (the conversation lives in
// a tab-wide store, not the page); "+N more" in Your week opens the rest;
// Documents is a plain list (the generator is gone, Tui drafts contracts); and
// every loading screen was checked against its page: the Clients, Money,
// Calendar and Settings ones corrected, and job, client and document records,
// the new-job and new-client forms and Tui now have their own instead of
// showing their parent list's.
// 3.16.1 — contracts stay short: the drafter is told the lawyer cuts
// (no definitions, no survival clause, ownership in two clauses, the legal bits
// in four), and a draft over 1,100 words gets one automatic tightening pass
// before it is saved. Revisions default to 2 rounds per video.
// 3.17.0 — contracts fit on 2 to 3 pages: no cover page, tighter type, and a
// 550 to 850 word brief with a clause budget per section (6 pages before).
// 3.17.1 — monthly contracts start the day both sign and have no end date,
// instead of leaving a [start date] blank.
// 3.18.0 — Tui has a long-term memory: tell it how you work ("a reel takes me
// an hour") and it remembers on the dashboard and Telegram. Settings → Memory
// lists everything it knows, grouped, with edit, delete and add.
// 3.19.0 — calendar events link to a client and a job: pick them when adding
// an event or change them on an existing one, Tui does the same by chat, and
// the links open the client or job. The invoice Send card is green and reads
// "Email invoice INV-0168 ($200.00) to Sky Automotive" instead of showing an
// id, and Tui no longer asks "want me to send it?" before showing it.
// 3.19.1 — the Tui thread stays pinned to the newest message instead of
// sometimes ending just above it.
// 3.20.0 — Tui drafts proposals too, written by the same Opus drafter as
// contracts and saved as a draft on the job. Both now start with one complete
// popup built from the record (the same full checklist every time, what the CRM
// knows as the first answer) and the drafter will not run until every answer
// is in, so one prompt gets the document right the first time. Proposal edits
// after that are free and instant, with no redraft.
// 3.21.0 — proposals cleaned up end to end. The editor has Edit and "What the
// client sees" tabs, a status card and Download PDF. The client's proposal page
// reads like a letter with the price up top and a sticky Accept on phones, and
// can be downloaded as a PDF laid out like the contract. Sent proposals now
// show in the client portal. The proposal drafter writes in Arlo's own voice,
// learned from his sent emails.
// 3.21.1 — redeploy of 3.21.0.
export const APP_VERSION = '3.21.1'
