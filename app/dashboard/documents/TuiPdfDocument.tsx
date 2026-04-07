import { Document, Page, Text, View, StyleSheet, Font, Svg, Path } from '@react-pdf/renderer'
import type { ReactElement } from 'react'

Font.register({
  family: 'Poppins',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/poppins/v22/pxiEyp8kv8JHgFVrFJM.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLEj6V1s.ttf', fontWeight: 600 },
  ],
})

const styles = StyleSheet.create({
  page: { fontFamily: 'Poppins', fontSize: 10, color: '#1a1a1a', paddingBottom: 60 },
  header: { backgroundColor: '#0a0a0a', padding: 30, paddingBottom: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: 600 },
  headerSub: { color: '#888888', fontSize: 9, marginTop: 4 },
  body: { padding: 40, paddingTop: 30 },
  section: { marginBottom: 20 },
  label: { fontSize: 8, fontWeight: 600, color: '#888888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  value: { fontSize: 10, color: '#1a1a1a', lineHeight: 1.6 },
  row: { flexDirection: 'row', gap: 20, marginBottom: 12 },
  col: { flex: 1 },
  divider: { height: 1, backgroundColor: '#e5e5e5', marginVertical: 16 },
  bodyText: { fontSize: 10, color: '#333333', lineHeight: 1.8, whiteSpace: 'pre-wrap' },
  signatureBlock: { flexDirection: 'row', marginTop: 40, gap: 40 },
  signatureCol: { flex: 1 },
  signatureLine: { height: 1, backgroundColor: '#1a1a1a', marginTop: 40, marginBottom: 6 },
  signatureLabel: { fontSize: 9, color: '#888888' },
  signatureName: { fontSize: 10, fontWeight: 600, marginBottom: 2 },
  footer: { position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: '#888888' },
})

type FormData = {
  clientName: string
  clientEmail: string
  clientPhone: string
  businessName: string
  date: string
  jobDescription: string
  shootDate: string
  location: string
  body: string
}

function TuiLogo() {
  return (
    <Svg width={80} height={16} viewBox="0 0 200 40">
      <Path d="M10 8h30v6H28v26h-8V14H10V8z" fill="#ffffff" />
      <Path d="M50 8h8v20c0 4 2 6 6 6s6-2 6-6V8h8v20c0 8-5 14-14 14s-14-6-14-14V8z" fill="#ffffff" />
      <Path d="M90 8h8v32h-8V8z" fill="#ffffff" />
      <Path d="M120 8h16l8 14 8-14h16v32h-8V18l-10 16h-12l-10-16v22h-8V8z" fill="#ffffff" />
      <Path d="M180 8h20v6h-12v6h10v6h-10v8h12v6h-20V8z" fill="#ffffff" />
    </Svg>
  )
}

export default function TuiDocument({ template, form }: { template: string; form: FormData }): ReactElement {
  const formattedDate = form.date ? new Date(form.date + 'T00:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const formattedShootDate = form.shootDate ? new Date(form.shootDate + 'T00:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <TuiLogo />
            <Text style={styles.headerSub}>Professional Videography</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: 600 }}>{template}</Text>
            <Text style={styles.headerSub}>{formattedDate}</Text>
          </View>
        </View>

        {/* Body */}
        <View style={styles.body}>
          {/* Client & Job Info */}
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Client</Text>
              <Text style={styles.value}>{form.clientName || '—'}</Text>
              {form.clientEmail && <Text style={[styles.value, { fontSize: 9, color: '#666' }]}>{form.clientEmail}</Text>}
              {form.clientPhone && <Text style={[styles.value, { fontSize: 9, color: '#666' }]}>{form.clientPhone}</Text>}
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Business</Text>
              <Text style={styles.value}>{form.businessName}</Text>
            </View>
          </View>

          {(form.jobDescription || form.shootDate || form.location) && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                {form.jobDescription && (
                  <View style={styles.col}>
                    <Text style={styles.label}>Job Description</Text>
                    <Text style={styles.value}>{form.jobDescription}</Text>
                  </View>
                )}
                <View style={styles.col}>
                  {form.shootDate && (
                    <>
                      <Text style={styles.label}>Shoot Date</Text>
                      <Text style={[styles.value, { marginBottom: 8 }]}>{formattedShootDate}</Text>
                    </>
                  )}
                  {form.location && (
                    <>
                      <Text style={styles.label}>Location</Text>
                      <Text style={styles.value}>{form.location}</Text>
                    </>
                  )}
                </View>
              </View>
            </>
          )}

          {form.body && (
            <>
              <View style={styles.divider} />
              <View style={styles.section}>
                <Text style={styles.bodyText}>{form.body}</Text>
              </View>
            </>
          )}

          {/* Signature Block */}
          <View style={styles.signatureBlock}>
            <View style={styles.signatureCol}>
              <Text style={styles.signatureName}>Arlo Radford | Tui Media</Text>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Signature</Text>
              <Text style={[styles.signatureLabel, { marginTop: 4 }]}>Date: _______________</Text>
            </View>
            <View style={styles.signatureCol}>
              <Text style={styles.signatureName}>Client Signature</Text>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>{form.clientName || 'Name'}</Text>
              <Text style={[styles.signatureLabel, { marginTop: 4 }]}>Date: _______________</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>tuimedia.nz</Text>
      </Page>
    </Document>
  )
}
