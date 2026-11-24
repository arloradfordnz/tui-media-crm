// Fixed contract terms, version 1, and the project sheet that goes above them.
//
// Contracts used to be written fresh by Opus for every deal, so the legal
// wording (liability cap, copyright, the deposit rule) could differ from one
// client to the next and nobody had read any particular version. Now the
// terms are written once (contracts/contract-terms-v1.md, written with Fable
// and approved by Arlo on 25 November 2026) and only the project sheet changes
// per client. The sheet's facts are pulled out of Arlo's answers by a cheap
// model (lib/contract-sheet.ts); everything below is plain code.
//
// Changing a term means a new TERMS_VERSION, not an edit here: every saved
// contract records the version it was assembled from, so what a client signed
// can always be told apart from what is current.

export const TERMS_VERSION = 'v1'

export type ContractKind = 'monthly' | 'one_off' | 'event'

/** Engagement types from the intake (lib/drafting-intake.ts) to a terms kind. */
export function contractKindFor(engagement: string): ContractKind {
  if (engagement === 'monthly_retainer') return 'monthly'
  if (engagement === 'event_coverage') return 'event'
  return 'one_off'
}

/** The deal, one plain-English line each. Empty means it does not apply. */
export type SheetFacts = {
  work: string
  shoot: string
  /** Events and weddings: name, date, times, venue, hours, overtime. */
  event: string
  delivery: string
  fee: string
  /** One-off and events only. Never over half the fee. */
  deposit: string
  invoices: string
  travel: string
  starts: string
  /** Anything else agreed. This wins over the terms below it. */
  extras: string
}

export type SheetParties = {
  /** Arlo's side, from lib/brand.ts: "Arlo Radford trading as Tui Media". */
  partyLine: string
  /** Arlo's contact line, from lib/brand.ts. */
  ourContact: string
  clientLegalName: string
  signatoryName: string
  signatoryRole: string | null
  clientContact: string
}

const line = (label: string, value: string) => (value.trim() ? `**${label}:** ${value.trim()}` : null)

export function projectSheet(kind: ContractKind, parties: SheetParties, f: SheetFacts): string {
  const signer = `${parties.signatoryName}${parties.signatoryRole ? `, ${parties.signatoryRole}` : ''}`
  const lines = [
    '# At a glance',
    line('Between', `${parties.partyLine} ("we", "us"), and ${parties.clientLegalName} ("you"), signed for you by ${signer}`),
    line('The work', f.work),
    line('Shoot', kind === 'event' ? '' : f.shoot),
    line('The event', kind === 'event' ? f.event : ''),
    line('Delivery', f.delivery),
    line('Fee', f.fee),
    line('Deposit', kind === 'monthly' ? '' : f.deposit),
    line('Invoices', f.invoices),
    line('Travel', f.travel),
    line('Starts', kind === 'event' ? '' : f.starts),
    line('Ending', kind === 'monthly' ? "either of us, with 14 days' notice by email" : ''),
    line('Anything else agreed', f.extras || 'nothing extra'),
    line('Contacts', `${parties.ourContact} for us, and ${parties.clientContact} for you. Notices go to these emails`),
    'This summary and the terms below are the whole agreement. If they disagree, this summary wins.',
  ]
  return lines.filter((l): l is string => !!l).join('\n\n')
}

const T = (n: number, title: string, text: string) => `**${n}. ${title}.** ${text}`

const CANCELLING: Record<ContractKind, string> = {
  monthly: "Either of us can move a shoot at no cost with 24 hours' notice. If we cancel a shoot, or weather or something outside both our control stops it, that month's unmade videos move to the next month, once. If you cancel with less than 24 hours' notice, don't turn up, or don't give us access, those videos lapse without refund, because we set the time aside for you.",
  one_off: "Your deposit holds the shoot date. Either of us can move the shoot at no cost with 24 hours' notice. If you cancel the project, we keep the deposit, because we held the date and turned other work away, and you pay for any work already done beyond it. If we cancel a shoot, or weather or something outside both our control stops it, we rebook for the next date that suits us both. If we can't do the work at all, we refund everything you paid for work not done.",
  event: 'Your deposit holds the date. If you cancel, we keep the deposit, because we held the date and turned other work away. If the event is postponed, the deposit moves to the new date, once, if we are free that day; if we are not, or it moves again, that counts as you cancelling. If we cannot film on the day, we refund everything you paid. If weather or the venue limits filming, we film what we safely can and the fee stays payable.',
}

const ENDING: Record<ContractKind, string> = {
  monthly: "Either of us can end this agreement by giving the other 14 days' notice by email. Either of us can end it sooner if the other seriously breaches it and does not fix that within 10 working days of being told in writing. You pay for work done up to the end date. If you have paid for videos we have not delivered, we will either deliver them within a reasonable time or refund you for them, and we will tell you which in writing.",
  one_off: 'This agreement ends when the work is delivered and paid for. Either of us can end it sooner if the other seriously breaches it and does not fix that within 10 working days of being told in writing; you then pay for work done to that point, and we refund anything paid beyond it, other than a deposit we keep under clause 4.',
  event: 'This agreement ends when the work is delivered and paid for. Either of us can end it sooner if the other seriously breaches it and does not fix that within 10 working days of being told in writing; you then pay for work done to that point, and we refund anything paid beyond it, other than a deposit we keep under clause 4.',
}

const CAP: Record<ContractKind, string> = {
  monthly: 'Each of us is liable to the other for no more than the fees paid in the 3 months before the claim.',
  one_off: 'Each of us is liable to the other for no more than the fee.',
  event: 'Each of us is liable to the other for no more than the fee.',
}

export function fixedTerms(kind: ContractKind, clientIsBusiness: boolean): string {
  return [
    '# Terms',
    T(1, 'The work', 'We make what the summary above lists. Anything else is extra work, which we quote and you approve in writing before we start it. You give us access to the place, people and products we need to film. If you are late with access, feedback or payment, our dates move by the same amount.'),
    T(2, 'Edits and approval', "We deliver every edit through the client portal. Each video includes 2 rounds of changes. A round is one set of changes to the existing edit; a new idea or a reshoot is extra work. You have 2 working days to approve an edit or ask for changes. If we don't hear from you we send a reminder, and the edit counts as approved 2 working days after that."),
    T(3, 'Payment', 'You pay each invoice by bank transfer within 7 days of it being sent. We may pause work while an invoice is overdue. Costs beyond the fee are payable only if you agreed to them in writing first.'),
    T(4, 'Shoots and cancelling', CANCELLING[kind]),
    T(5, 'Who owns what', 'Once you have paid in full for a video, you own the copyright in the final video. We keep the raw footage and will send it within 5 working days of you asking, once you have paid; you may use it for your own purposes. We may show the work in our portfolio and on our social media unless you ask us in writing not to. Licensed music and stock footage may be used only as part of the finished videos. You may edit the videos, and you don\'t need to credit us. We keep your files for 12 months after final delivery.'),
    T(6, 'People and safety', 'You are responsible for telling the people we film at your place or event (staff, customers, guests) that filming is happening, and for getting any permission needed. We use footage of people only for this work and our portfolio. You tell us about any hazards on site, and we may stop filming if it is not safe.'),
    T(7, 'Ending the agreement', ENDING[kind]),
    T(8, "What we don't promise, and limits", `We do not guarantee views, enquiries, sales or any other result. Neither of us is liable to the other for indirect loss or lost profits. ${CAP[kind]} These limits do not apply where the law does not allow them.`),
    T(9, 'Consumer law', clientIsBusiness
      ? 'We are both in trade and you are buying these services for your business. We agree that the Consumer Guarantees Act 1993 does not apply (section 43 of that Act), and that sections 9, 12A, 13 and 14(1) of the Fair Trading Act 1986 do not apply (sections 5C and 5D of that Act), and that this is fair and reasonable.'
      : 'Nothing in this agreement limits your rights under the Consumer Guarantees Act 1993.'),
    T(10, 'The rest', "We each keep the other's private business information confidential. We are an independent contractor, not your employee. Neither of us is liable for delays caused by things outside our reasonable control. Changes to this agreement must be agreed in writing (email is fine). If there is a dispute we talk it through first, then go to mediation in Nelson. New Zealand law applies. This agreement can be signed electronically."),
    `Terms version ${TERMS_VERSION.replace(/^v/, '')}.`,
  ].join('\n\n')
}

export function assembleContract(kind: ContractKind, clientIsBusiness: boolean, parties: SheetParties, facts: SheetFacts): string {
  return `${projectSheet(kind, parties, facts)}\n\n${fixedTerms(kind, clientIsBusiness)}`
}

// ── Pre-save checks ───────────────────────────────────────────────────────────
//
// Plain code, run on every assembled contract before it is saved. Problems
// stop the save and say what to fix; blanks are allowed (they are listed for
// Arlo to fill) but are reported.

const firstAmount = (s: string): number | null => {
  const m = s.replace(/,/g, '').match(/\$\s?(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : null
}

export type ContractCheck = { problems: string[]; blanks: string[] }

export function checkContract(kind: ContractKind, parties: SheetParties, facts: SheetFacts, body: string): ContractCheck {
  const problems: string[] = []
  if (!parties.clientLegalName.trim()) problems.push('the client legal name is empty')
  if (!parties.signatoryName.trim()) problems.push('nobody is named to sign for the client')
  if (!body.includes(parties.clientLegalName)) problems.push('the legal name is not in the contract')
  if (!facts.work.trim()) problems.push('the work is not described')
  if (!facts.fee.trim()) problems.push('there is no fee')

  const fee = firstAmount(facts.fee)
  const deposit = firstAmount(facts.deposit)
  if (kind !== 'monthly' && fee !== null && deposit !== null && deposit > fee / 2 + 0.5) {
    problems.push(`the deposit ($${deposit}) is more than half the fee ($${fee}). A deposit kept on cancellation has to stay proportionate, so make it at most half and treat the rest as an advance payment`)
  }
  if (kind !== 'monthly' && fee !== null && !facts.deposit.trim()) {
    problems.push('a one-off or event contract needs a deposit line (the cancellation term relies on it). If there is genuinely no deposit, say "No deposit"')
  }
  if (kind === 'event' && !facts.event.trim()) problems.push('the event details are missing')
  for (let n = 1; n <= 10; n++) if (!body.includes(`**${n}. `)) problems.push(`term ${n} is missing`)
  if (/[—–]/.test(body)) problems.push('the contract contains a dash Arlo never uses')

  const blanks = [...new Set(body.match(/\[[^\]\n]{1,60}\]/g) ?? [])]
  return { problems, blanks }
}
