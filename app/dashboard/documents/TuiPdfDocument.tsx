import { Document, Page, Text, View, StyleSheet, Font, Svg, G, Path, Ellipse } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'

Font.register({
  family: 'Poppins',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/poppins/v24/pxiEyp8kv8JHgFVrFJA.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLEj6V1s.ttf', fontWeight: 600 },
  ],
})

const styles = StyleSheet.create({
  page: { fontFamily: 'Poppins', fontSize: 12, color: '#1a1a1a', paddingBottom: 70 },
  header: { paddingHorizontal: 48, paddingTop: 40, paddingBottom: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#1a1a1a', fontSize: 22, fontWeight: 600 },
  headerSub: { color: '#888888', fontSize: 11, marginTop: 6 },
  body: { paddingHorizontal: 48, paddingTop: 16 },
  section: { marginBottom: 28 },
  label: { fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 },
  value: { fontSize: 12, color: '#444444', lineHeight: 1.6 },
  meta: { fontSize: 11, color: '#666666', lineHeight: 1.6 },
  row: { flexDirection: 'row', gap: 32, marginBottom: 28 },
  col: { flex: 1 },
  bodyText: { fontSize: 12, color: '#2a2a2a', lineHeight: 1.8 },
  paragraph: { fontSize: 12, color: '#2a2a2a', lineHeight: 1.8, marginBottom: 10 },
  h1: { fontSize: 20, fontWeight: 600, color: '#1a1a1a', marginTop: 18, marginBottom: 10 },
  h2: { fontSize: 16, fontWeight: 600, color: '#1a1a1a', marginTop: 16, marginBottom: 8 },
  h3: { fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginTop: 14, marginBottom: 6 },
  sectionHeading: { fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 8 },
  signatureBlock: { flexDirection: 'row', marginTop: 56, gap: 48 },
  signatureCol: { flex: 1 },
  signatureTyped: { fontSize: 14, color: '#1a1a1a', marginBottom: 4, height: 18 },
  signatureLine: { height: 1, backgroundColor: '#1a1a1a', marginBottom: 8 },
  signatureLabel: { fontSize: 10, color: '#888888', marginTop: 6 },
  signatureName: { fontSize: 13, fontWeight: 600, color: '#1a1a1a' },
  signaturePrinted: { fontSize: 11, color: '#666666', marginTop: 2 },
  footer: { position: 'absolute', bottom: 28, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#999999' },
})

type FormData = {
  clientName: string
  contactPerson?: string
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
    <Svg width={130} height={27} viewBox="0 0 1280 264.55">
      <G>
        <Path d="M306.45,44.96v23.38h-46.52v151.37h-28.66V68.34h-46.77v-23.38h121.95Z" fill="#111" />
        <Path d="M460.83,81.16v138.54h-28.66v-16.34c-4.53,5.7-10.44,10.18-17.73,13.45-7.29,3.27-15.05,4.9-23.26,4.9-10.9,0-20.66-2.26-29.29-6.79-8.64-4.53-15.42-11.23-20.37-20.11-4.95-8.88-7.42-19.61-7.42-32.18v-81.47h28.41v77.19c0,12.41,3.1,21.92,9.3,28.54,6.2,6.62,14.67,9.93,25.4,9.93s19.23-3.31,25.52-9.93c6.29-6.62,9.43-16.13,9.43-28.54v-77.19h28.66Z" fill="#111" />
        <Path d="M500.05,57.53c-3.52-3.52-5.28-7.88-5.28-13.08s1.76-9.55,5.28-13.07c3.52-3.52,7.88-5.28,13.08-5.28s9.3,1.76,12.82,5.28c3.52,3.52,5.28,7.88,5.28,13.07s-1.76,9.55-5.28,13.08-7.79,5.28-12.82,5.28-9.55-1.76-13.08-5.28ZM527.2,81.16v138.54h-28.66V81.16h28.66Z" fill="#111" />
        <Path d="M731.37,46.97v172.74h-11.32V70.6l-66.38,149.1h-9.05l-66.63-149.1v149.1h-11.31V46.97h12.07l70.4,157.9,70.4-157.9h11.82Z" fill="#111" />
        <Path d="M895.3,155.84h-117.92c.33,12.24,3.02,22.55,8.05,30.93,5.03,8.38,11.65,14.67,19.86,18.86,8.21,4.19,17.18,6.29,26.9,6.29,13.41,0,24.64-3.31,33.69-9.93,9.05-6.62,14.75-15.63,17.1-27.03h11.82c-2.68,13.92-9.55,25.19-20.62,33.82-11.06,8.64-25.06,12.95-41.99,12.95-12.74,0-24.14-2.85-34.2-8.55-10.06-5.7-17.94-13.87-23.64-24.51-5.7-10.64-8.55-23.09-8.55-37.34s2.81-26.65,8.42-37.21c5.61-10.56,13.45-18.65,23.51-24.26,10.06-5.61,21.54-8.42,34.45-8.42s24.43,2.81,34.07,8.42c9.64,5.62,16.97,13.08,22,22.38s7.54,19.32,7.54,30.05c0,6.03-.17,10.56-.5,13.58ZM878.08,115.86c-4.78-8.38-11.28-14.62-19.49-18.73-8.22-4.11-17.1-6.16-26.65-6.16s-18.4,2.06-26.53,6.16c-8.13,4.11-14.75,10.35-19.86,18.73-5.12,8.38-7.84,18.61-8.17,30.68h107.11c.5-12.07-1.63-22.29-6.41-30.68Z" fill="#111" />
        <Path d="M931.39,114.35c5.61-10.56,13.41-18.69,23.38-24.39,9.97-5.7,21.33-8.55,34.07-8.55,13.91,0,25.98,3.48,36.21,10.44,10.22,6.96,17.43,15.97,21.62,27.03V33.64h11.31v186.06h-11.31v-36.21c-4.02,11.23-11.06,20.41-21.12,27.53-10.06,7.13-22.3,10.69-36.71,10.69-12.74,0-24.1-2.89-34.07-8.67-9.97-5.78-17.77-13.99-23.38-24.64-5.62-10.64-8.42-23.01-8.42-37.09s2.81-26.4,8.42-36.96ZM1039.25,119.76c-4.95-9.13-11.69-16.17-20.24-21.12-8.55-4.94-18.1-7.42-28.66-7.42s-20.79,2.39-29.17,7.17c-8.38,4.78-14.92,11.69-19.61,20.74-4.69,9.05-7.04,19.78-7.04,32.18s2.35,23.13,7.04,32.18c4.69,9.05,11.27,16.01,19.74,20.87,8.46,4.86,18.14,7.29,29.04,7.29s20.15-2.47,28.79-7.42c8.63-4.94,15.38-11.98,20.24-21.12,4.86-9.13,7.29-19.74,7.29-31.81s-2.48-22.42-7.42-31.56Z" fill="#111" />
        <Path d="M1098.21,50.11c-1.85-1.76-2.77-4.15-2.77-7.17,0-2.85.92-5.19,2.77-7.04,1.84-1.84,4.11-2.77,6.79-2.77s4.94.92,6.79,2.77c1.84,1.85,2.77,4.19,2.77,7.04,0,3.02-.92,5.41-2.77,7.17-1.85,1.76-4.11,2.64-6.79,2.64s-4.95-.88-6.79-2.64ZM1110.53,83.17v136.53h-11.31V83.17h11.31Z" fill="#111" />
        <Path d="M1153.4,114.35c5.61-10.56,13.41-18.69,23.38-24.39,9.97-5.7,21.33-8.55,34.07-8.55,14.41,0,26.65,3.52,36.71,10.56,10.06,7.04,17.1,16.01,21.12,26.9v-35.7h11.31v136.53h-11.31v-35.96c-4.02,11.06-11.11,20.16-21.25,27.28-10.14,7.13-22.34,10.69-36.58,10.69-12.74,0-24.1-2.89-34.07-8.67-9.97-5.78-17.77-13.99-23.38-24.64-5.62-10.64-8.42-23.01-8.42-37.09s2.81-26.4,8.42-36.96ZM1261.27,119.76c-4.95-9.13-11.69-16.17-20.24-21.12-8.55-4.94-18.1-7.42-28.66-7.42s-20.79,2.39-29.17,7.17c-8.38,4.78-14.92,11.69-19.61,20.74-4.69,9.05-7.04,19.78-7.04,32.18s2.35,23.13,7.04,32.18c4.69,9.05,11.27,16.01,19.74,20.87,8.46,4.86,18.14,7.29,29.04,7.29s20.15-2.47,28.79-7.42c8.63-4.94,15.38-11.98,20.24-21.12,4.86-9.13,7.29-19.74,7.29-31.81s-2.48-22.42-7.42-31.56Z" fill="#111" />
      </G>
      <G>
        <Path d="M145.74,234c-8.53-15.34-30.37-46.95-30.12-53.57.05-1.35.41-2.6.41-2.6,1.27-3.08,2.84-7.57,3.75-13.14,1.04-6.3,1.03-12.62-.32-21.43-1.07-6.99-3.39-20.63-10.94-36.78-11.78-25.17-29.53-40.9-40.11-48.89,2.72-12.63-4.25-12.73-5.21-16.31-.5-1.85.56-3.47,1.35-4.88,5.06-9.1,4.43-9.87,6.42-12.53,4.62-6.15,15.36-11.86,29.13-13.48,2.24-.51,2.72-1.11,2.78-1.54.18-1.33-3.38-3.07-5.63-3.75-4.49-1.36-7.08-1.08-15.5-.19-9.58,1.01-10.91-3.42-22.22-4.51C28.54-2.59,26.9,11.7,15.87,34.61c-4.34,9.04-6.63,13.47-8.37,18.46-.95,2.71-2.97,9.06-4.46,18.31-2.18,13.53-4.88,30.25-1.26,49.25,5.64,29.65,26.71,65.26,52.74,73.33,4.35,1.35,9.12,2.02,12.71,6.38,7.38,8.97,4.85,27.62,9.96,35.1.41.59,1.29,2.09,3.1,2.94,3.27,1.53,6.74-.48,7.85.76,2.55,16.48,11.45,26.09,18.16,25.36,5.05-.55,8.45-6.92,9.75-9.71.39.3,5.3,3.91,11.26,1.88,5.44-1.86,7.29-6.89,7.51-7.51,2.41.64,12.18,3.09,15.01-.95,1.87-2.67-.13-7.1-4.08-14.22Z" fill="#111" />
        <Ellipse cx="61.72" cy="54.04" rx="8.92" ry="11.37" fill="#fff" stroke="#111" strokeWidth={2.18} />
      </G>
    </Svg>
  )
}

function renderInline(text: string): ReactElement[] {
  const parts: ReactElement[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<Text key={i++}>{text.slice(last, m.index)}</Text>)
    parts.push(<Text key={i++} style={{ fontWeight: 600 }}>{m[1]}</Text>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(<Text key={i++}>{text.slice(last)}</Text>)
  return parts
}

function renderBody(body: string): ReactElement[] {
  const lines = body.split('\n')
  const out: ReactElement[] = []
  let buffer: string[] = []
  let key = 0

  const flush = () => {
    if (buffer.length === 0) return
    const para = buffer.join(' ')
    out.push(<Text key={key++} style={styles.paragraph}>{renderInline(para)}</Text>)
    buffer = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (line === '') { flush(); continue }
    const h3 = /^###\s+(.+)/.exec(line)
    const h2 = /^##\s+(.+)/.exec(line)
    const h1 = /^#\s+(.+)/.exec(line)
    if (h3) { flush(); out.push(<Text key={key++} style={styles.h3}>{renderInline(h3[1])}</Text>); continue }
    if (h2) { flush(); out.push(<Text key={key++} style={styles.h2}>{renderInline(h2[1])}</Text>); continue }
    if (h1) { flush(); out.push(<Text key={key++} style={styles.h1}>{renderInline(h1[1])}</Text>); continue }
    buffer.push(line)
  }
  flush()
  return out
}

export default function TuiDocument({ template, form }: { template: string; form: FormData }): ReactElement<DocumentProps> {
  const formattedDate = form.date ? new Date(form.date + 'T00:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const formattedShootDate = form.shootDate ? new Date(form.shootDate + 'T00:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const today = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <TuiLogo />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.headerTitle}>{template}</Text>
            <Text style={styles.headerSub}>{formattedDate}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Client</Text>
              <Text style={styles.value}>{form.clientName || '—'}</Text>
              {form.contactPerson && <Text style={styles.meta}>Attn: {form.contactPerson}</Text>}
              {form.clientEmail && <Text style={styles.meta}>{form.clientEmail}</Text>}
              {form.clientPhone && <Text style={styles.meta}>{form.clientPhone}</Text>}
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Prepared by</Text>
              <Text style={styles.value}>{form.businessName}</Text>
            </View>
          </View>

          {(form.jobDescription || form.shootDate || form.location) && (
            <View style={styles.row}>
              {form.jobDescription && (
                <View style={styles.col}>
                  <Text style={styles.label}>Job Description</Text>
                  <Text style={styles.value}>{form.jobDescription}</Text>
                </View>
              )}
              <View style={styles.col}>
                {form.shootDate && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={styles.label}>Shoot Date</Text>
                    <Text style={styles.value}>{formattedShootDate}</Text>
                  </View>
                )}
                {form.location && (
                  <View>
                    <Text style={styles.label}>Location</Text>
                    <Text style={styles.value}>{form.location}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {form.body && (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Content</Text>
              {renderBody(form.body)}
            </View>
          )}

          <View style={styles.signatureBlock}>
            <View style={styles.signatureCol}>
              <Text style={styles.signatureTyped}>Arlo Radford</Text>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureName}>Arlo Radford</Text>
              <Text style={styles.signaturePrinted}>Tui Media</Text>
              <Text style={styles.signatureLabel}>Signed {today}</Text>
            </View>
            <View style={styles.signatureCol}>
              <Text style={styles.signatureTyped}> </Text>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureName}>{form.contactPerson || form.clientName || 'Client'}</Text>
              <Text style={styles.signaturePrinted}>{form.contactPerson && form.clientName ? form.clientName : 'Client'}</Text>
              <Text style={styles.signatureLabel}>Date: _______________</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer} fixed>www.tuimedia.nz</Text>
      </Page>
    </Document>
  )
}
