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
export const APP_VERSION = '3.15.3'
