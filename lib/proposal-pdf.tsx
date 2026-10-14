import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
// Importing the contract document registers Bricolage Grotesque and gives us
// the same logo and palette, so a proposal and the contract that follows it
// read as one set of paperwork.
import { TuiLogo, C } from '@/app/dashboard/documents/TuiPdfDocument'

export type ProposalPdfData = {
  jobName: string
  clientName: string
  contactPerson?: string | null
  shootDate?: string | null
  shootLocation?: string | null
  coverNote: string | null
  services: { description: string; amount: number }[]
  inclusions: string[]
  paymentTerms: string | null
  totalValue: number
  pricingMode?: 'total' | 'options'
  priceSuffix?: string | null
  /** ISO timestamp the proposal was sent, or created if not sent yet. */
  issuedAt: string
  status: string
  respondedAt?: string | null
  /** Public link where it can be accepted. */
  url?: string | null
}

const money = (n: number) => `$${Number(n || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'long', year: 'numeric' })

// Set to the contract's measurements (TuiPdfDocument: 9.5pt body, 11.5pt
// headings, 60pt margins, the hairline rule under the header) so the two
// documents sit together.
const s = StyleSheet.create({
  page: { fontFamily: 'Bricolage Grotesque', fontSize: 9.5, color: C.black, backgroundColor: '#FFFFFF', paddingTop: 56, paddingBottom: 64, paddingHorizontal: 60 },
  headerWrap: { marginBottom: 18 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontWeight: 600, fontSize: 16, lineHeight: 1.2 },
  sub: { fontSize: 9.5, color: C.grey, marginTop: 6, lineHeight: 1.5 },
  subDate: { fontSize: 9.5, color: C.grey, marginTop: 1 },
  rule: { borderBottomWidth: 0.5, borderBottomColor: C.lgrey, marginTop: 16 },

  facts: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 18 },
  fact: { width: '50%', marginBottom: 8, paddingRight: 12 },
  factLabel: { fontSize: 8, color: C.grey, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  factValue: { fontSize: 9.5, fontWeight: 600 },

  h1: { fontWeight: 600, fontSize: 11.5, marginBottom: 8 },
  section: { marginBottom: 20 },
  para: { fontSize: 9.5, lineHeight: 1.55, marginBottom: 6 },

  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: C.lgrey },
  rowDesc: { flex: 1, paddingRight: 16, fontSize: 9.5, lineHeight: 1.45 },
  rowAmount: { fontSize: 9.5, fontWeight: 600 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10 },
  optionsNote: { fontSize: 9, color: C.grey, marginBottom: 6 },
  totalLabel: { fontSize: 10.5, fontWeight: 600 },
  totalValue: { fontSize: 14, fontWeight: 800 },
  totalNote: { fontSize: 8.5, color: C.grey, textAlign: 'right', marginTop: 2 },

  bullet: { flexDirection: 'row', marginBottom: 4 },
  bulletMark: { width: 12, fontSize: 9.5 },
  bulletText: { flex: 1, fontSize: 9.5, lineHeight: 1.45 },
  excluded: { fontSize: 9, color: C.grey, marginTop: 6 },


  footer: { position: 'absolute', bottom: 28, left: 60, right: 60, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8.5, color: C.grey },
})

export default function ProposalPdf({ p }: { p: ProposalPdfData }): ReactElement<DocumentProps> {
  const facts = [
    { label: 'Prepared for', value: p.contactPerson ? `${p.contactPerson}, ${p.clientName}` : p.clientName },
    { label: 'Project', value: p.jobName },
    p.shootDate && { label: 'Shoot date', value: longDate(p.shootDate) },
    p.shootLocation && { label: 'Location', value: p.shootLocation },
  ].filter((f): f is { label: string; value: string } => !!f)

  const accepted = p.status === 'accepted'
  return (
    <Document title={`Proposal - ${p.clientName}`} author="Tui Media">
      <Page size="A4" style={s.page}>
        <View fixed style={s.headerWrap}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Proposal</Text>
              <Text style={s.sub}>{p.clientName}</Text>
              <Text style={s.subDate}>{longDate(p.issuedAt)}</Text>
            </View>
            <TuiLogo />
          </View>
          <View style={s.rule} />
        </View>

        <View style={s.facts}>
          {facts.map((f) => (
            <View key={f.label} style={s.fact}>
              <Text style={s.factLabel}>{f.label}</Text>
              <Text style={s.factValue}>{f.value}</Text>
            </View>
          ))}
        </View>

        {p.coverNote ? (
          <View style={s.section}>
            {p.coverNote.split(/\n{2,}/).map((para, i) => (
              <Text key={i} style={s.para}>{para.replace(/\n/g, '\n')}</Text>
            ))}
          </View>
        ) : null}

        <View style={s.section} wrap={false}>
          <Text style={s.h1}>{p.pricingMode === 'options' ? 'Choose a package' : 'Services and pricing'}</Text>
          {p.pricingMode === 'options' && (
            <Text style={s.optionsNote}>Pick the one that suits{p.priceSuffix ? `, and you can change it ${p.priceSuffix.replace(/^a /, 'each ')}` : ''}.</Text>
          )}
          {p.services.map((line, i) => (
            <View key={i} style={s.row}>
              <Text style={s.rowDesc}>{line.description}</Text>
              <Text style={s.rowAmount}>{money(line.amount)}{p.pricingMode === 'options' && p.priceSuffix ? ` ${p.priceSuffix}` : ''}</Text>
            </View>
          ))}
          {p.pricingMode !== 'options' && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total</Text>
              <Text style={s.totalValue}>{money(p.totalValue)}</Text>
            </View>
          )}
          <Text style={s.totalNote}>NZD. Tui Media is not GST registered, so no GST is added.</Text>
        </View>

        {p.inclusions.length > 0 && (
          <View style={s.section}>
            <Text style={s.h1} minPresenceAhead={40}>What&apos;s included</Text>
            {p.inclusions.filter((l) => !/^not included/i.test(l)).map((line, i) => (
              <View key={i} style={s.bullet} wrap={false}>
                <Text style={s.bulletMark}>•</Text>
                <Text style={s.bulletText}>{line}</Text>
              </View>
            ))}
            {p.inclusions.filter((l) => /^not included/i.test(l)).map((line, i) => (
              <Text key={`x${i}`} style={s.excluded}>{line}</Text>
            ))}
          </View>
        )}

        {p.paymentTerms ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h1}>Payment terms</Text>
            <Text style={s.para}>{p.paymentTerms}</Text>
          </View>
        ) : null}

        <View style={s.section} wrap={false}>
          <Text style={s.h1}>{accepted ? 'Accepted' : 'Next step'}</Text>
          <Text style={s.para}>
            {accepted && p.respondedAt
              ? `${p.clientName} accepted this proposal on ${longDate(p.respondedAt)}. A contract follows to lock in the details.`
              : `To go ahead, accept the proposal online${p.url ? ` at ${p.url}` : ''} or reply to Arlo. A short contract follows to lock in the dates.`}
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text>Tui Media</Text>
          <Text render={({ pageNumber, totalPages }) => (totalPages > 1 ? `${pageNumber} of ${totalPages}` : '')} />
          <Text>hello@tuimedia.nz</Text>
        </View>
      </Page>
    </Document>
  )
}

/** Build the PDF in the browser and save it. */
export async function downloadProposalPdf(p: ProposalPdfData): Promise<void> {
  const { pdf } = await import('@react-pdf/renderer')
  const blob = await pdf(ProposalPdf({ p })).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Proposal_${p.clientName.replace(/[^\w]+/g, '_')}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
