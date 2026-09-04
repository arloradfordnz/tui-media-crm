---
name: tui-contract
description: Draft a Tui Media client contract and save it directly into the CRM so it appears in the client's portal immediately, in the brand's poster-style contract template. Use whenever asked to draft, create, write, or issue a Tui Media contract for a client.
---

# Tui Media contract

Produces a Tui Media video-ads project contract and writes it straight into
the CRM's Supabase database, in the same shape the CRM's own document editor
uses — so it shows up in `/dashboard/documents` and the client's
`/portal/client/[token]` page immediately, no manual step in the dashboard.

## The visual style is fixed — don't design it in chat

The "same style every time" part is handled by code, not by you. The
contract's look — dark navy poster cover, huge bold section headlines in
Bricolage Grotesque, the accent-blue rule, the approval/signature page — all
lives in
[`app/dashboard/documents/TuiPdfDocument.tsx`](../../../app/dashboard/documents/TuiPdfDocument.tsx),
gated on `template === 'Contract'`. Your job is only to gather the right
details and write good body copy in the markdown conventions below — never
hand-author HTML/PDF/styling for a contract.

## Voice rules (from the brand reference)

- Plain and direct. No marketing fluff, no "storytelling" language.
- **No em dashes**, anywhere.
- Say "video ads", not "video marketing".
- Don't imply a guarantee of results. Don't imply a retainer or ongoing
  commitment — this is a one-off project with a fixed scope.

## What the contract must actually say

Tui Media's standard project structure (see the client's own
`Tui_Media_Rebrand_Master_Reference.md` if you have access to the website
repo) is: **strategise → script → film → edit → launch & manage**. The
launch/manage phase runs paid ads for a fixed **one-month** period, priced
into the single project fee — not billed separately. At the end of that
month, the client gets everything: raw footage, final cuts, and the ad
account itself. No guarantees of results, no retainer, no lock-in.

Draft the `body` markdown using these section headings unless the user gives
you different ones — each becomes a big bold headline in the PDF:

```
# Scope of Work
...what's being delivered, referencing strategise/script/film/edit/launch & manage...

# Payment
...project fee, payment schedule/milestones, that media/ad spend is paid
direct by the client (not through Tui Media)...

# Timeline
...key dates: shoot date, expected delivery, the one-month launch & manage
window and when it starts...

# Ownership & Handover
...client owns the final footage, raw files, and ad account after handover;
what happens at the end of the month...

# Cancellation
...cancellation terms. No lock-in beyond the current project.
```

Do **not** add your own "Approval" section — the template always appends one
automatically before the signature block, so writing one in the body would
duplicate it.

### Markdown conventions the renderer understands

- `# Heading` → big poster-style section headline (this is the house style —
  use it for every major section above)
- `## Heading` → small accent-blue caps label (for a minor sub-point inside a
  section, used sparingly)
- `### Heading` → small bold heading
- `**text**` → bold inline
- Plain lines → body paragraphs

## Gathering the details

Ask (or infer from the CRM) whatever you don't already know:

- Which client this is for — an existing client (by name or id) or a new one
- Business name, contact person, email, phone, location
- Project description (one line — goes in the "Project" field on the cover
  and header)
- Shoot date, and the contract date
- The specifics of scope/payment/timeline/ownership/cancellation above

If the client doesn't exist in the CRM yet, confirm with the user before
creating one — don't silently spawn a new client record from a name
mentioned in passing.

## Creating the document

1. Write a payload JSON file (scratch location, not committed) shaped like:

```json
{
  "client": { "id": "<uuid>" },
  "businessName": "Acme Ltd",
  "date": "2026-08-25",
  "shootDate": "2026-09-10",
  "jobDescription": "One-line project description",
  "location": "Nelson",
  "body": "# Scope of Work\n...\n\n# Payment\n...\n\n# Timeline\n...\n\n# Ownership & Handover\n...\n\n# Cancellation\n...",
  "documentNumber": null,
  "docName": null
}
```

   Use `"client": { "name": "Acme Ltd" }` to look up an existing client by
   exact name, or add `"create": true` alongside `name` (plus
   `contactPerson`/`email`/`phone`/`location`) to create a new one — only
   after confirming with the user. Leave `documentNumber` and `docName` as
   `null`/omitted to let the script assign the next sequential number and a
   default name.

2. Run it from the repo root:

```bash
node scripts/create-contract.mjs /path/to/payload.json
```

   This requires `.env` (already present in the repo) for
   `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. It writes the
   document with the service role key, bypassing RLS the same way the app's
   own server actions do.

3. The script prints JSON with `documentId`, `portalUrl`, and `dashboardUrl`.
   Report both links back to the user.

## What this skill must never do on its own

- **Never email or send the contract to the client without the user asking
  first.** Creating the document is not the same as sending it — sending an
  email requires explicit permission every time, per the standing safety
  rules. If asked to email it, use the CRM's existing "Email to Client" flow
  (`/dashboard/documents/[id]`) or its `/api/documents/email` route, not an
  ad hoc email.
- **Never invent numbers, dates, or terms** the user hasn't given you — ask
  rather than guess at a project fee or payment schedule.
- **Never create a new client record silently** — confirm first.
