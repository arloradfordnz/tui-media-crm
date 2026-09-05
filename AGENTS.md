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

Verify against a restarted server before concluding the code is wrong. Three
times in one session a "bug" was this and nothing else.

**A restart is not always enough, and `touch` never is.** Turbopack keyed off
content, so a CSS block appended to `app/globals.css` stayed absent from the
served stylesheet through a full stop / cache-wipe / restart, and `touch` did
not shake it loose either. Adding a throwaway rule (`.zz-sentinel { color: red }`)
forced the rebuild, after which the real block appeared — and then removing the
sentinel was itself a content change, so it stuck. If a style is missing from
the compiled output, confirm it with

```bash
curl -s "http://localhost:3003$(curl -s http://localhost:3003/login   | grep -o '/_next/static/chunks/[^"]*\.css' | head -1)" | grep -c my-class
```

before touching the CSS itself — the source is usually fine.

## Lightning CSS dedupes backdrop-filter

Tailwind v4's Lightning CSS treats `backdrop-filter` and
`-webkit-backdrop-filter` as one property **within a single rule** and keeps
only the last one written. A whole pass of glass surfaces silently rendered as
flat opacity because the `-webkit-` line came last.

Put the standard `backdrop-filter` in its **own separate rule** from the
`-webkit-` one. Dedupe is within-rule, not cross-rule. Any new glass surface
must follow that split or it will not blur.

## Lightning CSS merges selector lists into :is()

A comma-separated selector list gets compiled into a single `:is(...)` rule,
and **`:is()` takes the specificity of its most specific argument**. So a group
like

```css
.field:has(.field-input:focus) > .field-label,
.field:has(textarea.field-input:not(:placeholder-shown)) > .field-label { ... }
```

outranks a plain `.field:has(.field-input:focus) > .field-label` written
*after* it, because the `textarea` member dragged the whole group's specificity
up. The later rule silently does nothing.

Same family as the backdrop-filter dedupe: the authored CSS is right and the
compiled CSS is not what you wrote. When a rule that should obviously win does
not, read the compiled output before rewriting the source.

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
