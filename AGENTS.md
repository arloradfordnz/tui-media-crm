<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Traps in this repo

Each of these has already cost a debugging session. They all present as a code
bug and are not one.

## The dev server serves stale code after an edit

`next.config.ts` puts the dev build in `/tmp/tui-media-crm-next` (out of the
iCloud-synced folder, where the watcher misses changes). That cache goes stale
on its own. Symptoms: an edit "doesn't apply", a hydration mismatch appears
where the server HTML shows values you just changed away from, or a route
handler keeps returning its old behaviour with no compile error.

**Before debugging any change that seems not to have taken effect:**

```bash
# 1. STOP the server. Never clear the cache while it is running — that kills
#    the cache mid-flight and every route 500s with an SST panic that looks
#    exactly like a code regression.
# 2. rm -rf /tmp/tui-media-crm-next
# 3. Start it again.
```

Verify against a restarted server before concluding the code is wrong. Twice in
one session a "bug" was this and nothing else.

## Lightning CSS dedupes backdrop-filter

Tailwind v4's Lightning CSS treats `backdrop-filter` and
`-webkit-backdrop-filter` as one property **within a single rule** and keeps
only the last one written. A whole pass of glass surfaces silently rendered as
flat opacity because the `-webkit-` line came last.

Put the standard `backdrop-filter` in its **own separate rule** from the
`-webkit-` one. Dedupe is within-rule, not cross-rule. Any new glass surface
must follow that split or it will not blur.

## CSS specificity ordering in globals.css

The mobile overrides sit in a large `@media (max-width: 768px)` block partway
through the file, but plenty of base rules are defined *after* it. Equal
specificity means the later rule wins, so an override placed in that block
silently loses to a base rule further down. When an override does not take,
check its position before its contents — put it directly after the rule it
overrides.

## Verify in the browser, not just with a green typecheck

Typecheck and lint pass on visually broken CSS. This branch shipped past a
green typecheck twice — a flex-wrap bug that un-pinned status badges, and the
backdrop-filter dedupe above. Screenshot it or read computed styles.

## Regex inside the layout.tsx inline script

Backslash escaping is fragile across template-literal rules and shell
heredocs. Prefer plain string methods (`indexOf`, `startsWith`) over regex
literals in that script.
