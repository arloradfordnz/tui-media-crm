import { createServerSupabaseClient } from '@/lib/supabase'

function escapeIcs(str: string) {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function formatIcsDate(dateStr: string, time?: string | null) {
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  if (time) {
    const [h, m] = time.split(':')
    return `${year}${month}${day}T${h.padStart(2, '0')}${m.padStart(2, '0')}00`
  }
  return `${year}${month}${day}`
}

export async function GET() {
  const supabase = await createServerSupabaseClient()

  const [{ data: events }, { data: jobs }] = await Promise.all([
    supabase.from('events').select('id, title, event_type, date, start_time, end_time, notes').order('date', { ascending: true }),
    supabase.from('jobs').select('id, name, shoot_date, shoot_location').not('shoot_date', 'is', null),
  ])

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tui Media//CRM//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Tui Media',
  ]

  for (const event of events ?? []) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:event-${event.id}@tuimedia`)
    lines.push(`SUMMARY:${escapeIcs(event.title)}`)

    if (event.start_time) {
      lines.push(`DTSTART:${formatIcsDate(event.date, event.start_time)}`)
      if (event.end_time) {
        lines.push(`DTEND:${formatIcsDate(event.date, event.end_time)}`)
      }
    } else {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(event.date)}`)
    }

    if (event.notes) {
      lines.push(`DESCRIPTION:${escapeIcs(event.notes)}`)
    }
    lines.push(`CATEGORIES:${escapeIcs(event.event_type)}`)
    lines.push('END:VEVENT')
  }

  for (const job of jobs ?? []) {
    if (!job.shoot_date) continue
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:job-${job.id}@tuimedia`)
    lines.push(`SUMMARY:${escapeIcs(`Shoot: ${job.name}`)}`)
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(job.shoot_date)}`)
    if (job.shoot_location) {
      lines.push(`LOCATION:${escapeIcs(job.shoot_location)}`)
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  return new Response(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="tui-media.ics"',
    },
  })
}
