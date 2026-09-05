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
export const APP_VERSION = '3.0.0'
