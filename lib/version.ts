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
export const APP_VERSION = '3.10.2'
