---
name: tui-contract
description: Draft a Tui Media client contract and save it directly into the CRM so it appears in the client's portal immediately, in the brand's minimal black-and-white contract template. Use whenever asked to draft, create, write, or issue a Tui Media contract for a client.
---

# Tui Media contract

Produces a Tui Media client contract (a one-off video ad project, a monthly
retainer, event coverage or anything else), written for that client's project,
and writes it straight into
the CRM's Supabase database, in the same shape the CRM's own document editor
uses — so it shows up in `/dashboard/documents` and the client's
`/portal/client/[token]` page immediately, no manual step in the dashboard.

## The visual style is fixed — don't design it in chat

The "same style every time" part is handled by code, not by you. The
contract's look — plain white cover, black-and-white only, modest bold
section headings in Bricolage Grotesque, the approval/signature page — all
lives in
[`app/dashboard/documents/TuiPdfDocument.tsx`](../../../app/dashboard/documents/TuiPdfDocument.tsx),
gated on `template === 'Contract'`. Your job is only to gather the right
details and write good body copy in the markdown conventions below — never
hand-author HTML/PDF/styling for a contract.

## Voice rules (from the brand reference)

- Plain and direct. No marketing fluff, no "storytelling" language.
- **No em dashes**, anywhere.
- Say "video ads", not "video marketing".
- Don't imply a guarantee of results, or an ongoing commitment the deal
  doesn't have.

## What the contract must actually say

For a one-off video ad project, Tui Media's structure (see the client's own
`Tui_Media_Rebrand_Master_Reference.md` if you have access to the website
repo) is: **strategise → script → film → edit → launch & manage**. The
launch/manage phase runs paid ads for a fixed **one-month** period, priced
into the single project fee — not billed separately. At the end of that
month, the client gets everything: raw footage, final cuts, and the ad
account itself. No guarantees of results, no retainer, no lock-in.

The rules for what a contract says (structure, rollover, ending the
agreement, deposits, delivery and feedback through the client portal, the
defaults for every blank, and the 3 to 4 page length) live in one place: `CONTRACT_DRAFTING_BRIEF` in
[`lib/contract-drafting.ts`](../../../lib/contract-drafting.ts). Read it and
follow it. Do not work from memory or from the old five-heading outline, and do
not copy its rules into this file, so there is one version to keep right.

There is no saved contract template. Follow the brief's rules, but write
every contract for its own client and project: the real deliverables, dates,
platforms and payment schedule, and nothing that doesn't apply.

Draft the `body` as numbered sections and clauses, as the brief describes
(`# 1. Parties`, then clauses `1.1`, `1.2` and so on, each its own paragraph).
Keep it to 3 to 4 pages.

Do **not** add your own "Approval" section — the template always appends one
automatically before the signature block, so writing one in the body would
duplicate it.

### Markdown conventions the renderer understands

- `# Heading` → bold section heading (this is the house style —
  use it for every major section above)
- `## Heading` → small grey caps label (for a minor sub-point inside a
  section, used sparingly)
- `### Heading` → small bold heading
- `**text**` → bold inline
- Plain lines → body paragraphs

## Gathering the details

Ask (or infer from the CRM) whatever you don't already know:

- Which client this is for — an existing client (by name or id) or a new one
- Business name, main contact person, email, phone, location. The contract
  names the main contact, and they sign unless the user says otherwise. Take
  these from the client record; ask the user for any that are missing, and pass
  them in the payload so the script saves them to the client record.
- Project description (one line — goes in the "Project" field on the cover
  and header)
- Shoot date, and the contract date
- Whether the client is a **company or a sole trader** (or a partnership,
  trust or individual), their exact **legal name** (a company as registered,
  ending in Limited), and the **named person who signs** and their role. If
  this is not clear from the CRM, ask the user. Never guess: the signature
  block prints it.
- The fee, any deposit, the number of videos and the dates. These are the only
  things never defaulted. Everything else (shoot length, turnaround, feedback
  and approval periods, invoice date, reschedule notice, raw footage timing,
  storage period) uses the defaults in the brief.

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
  "clientLegalName": "Acme Limited",
  "entityType": "company",
  "contactPerson": "Jane Smith",
  "clientEmail": "jane@acme.co.nz",
  "body": "# 1. Parties\n\n1.1 ...\n\n# 2. The work\n\n2.1 ...",
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

   The script refuses a body that is missing or still has `[square bracket]`
   placeholders, and refuses to run without the client's legal name, entity
   type and a signatory. Legal name, entity type, contact person, email, phone
   and location passed in the payload are saved to the client record. Add
   `"signatoryName"` only if someone other than the main contact signs.

3. The script prints JSON with `documentId`, `portalUrl`, and `dashboardUrl`.
   Report both links back to the user, then list every default you used (one
   per line, with its clause number) so the user can review them.

## What this skill must never do on its own

- **Never email or send the contract to the client without the user asking
  first.** Creating the document is not the same as sending it — sending an
  email requires explicit permission every time, per the standing safety
  rules. If asked to email it, use the CRM's existing "Email to Client" flow
  (`/dashboard/documents/[id]`) or its `/api/documents/email` route, not an
  ad hoc email.
- **Never invent a fee, deposit, quantity, date, legal name or signatory** the
  user hasn't given you. Ask. Every other gap gets a default from the brief,
  which you list for review.
- **Never create a new client record silently** — confirm first.
