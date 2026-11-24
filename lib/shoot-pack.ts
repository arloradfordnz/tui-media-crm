// The shoot-day pack: everything for tomorrow's shoot on one page.
//
// The playbook says "plan and shot list before every shoot", and the pieces
// were spread over the job, the client record, the calendar event and the
// inbox. This gathers them from the shoot's calendar event (every shoot is
// one: a job's shoot date makes one, and retainer shoots are logged as one)
// and writes a shot list from them on request, saved on the event.

import Anthropic from '@anthropic-ai/sdk'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type ShootPack = {
  eventId: string
  title: string
  /** YYYY-MM-DD, NZ day. */
  day: string
  startTime: string | null
  endTime: string | null
  eventNotes: string | null
  shotList: string | null
  shotListAt: string | null
  address: string | null
  job: {
    id: string
    name: string
    jobType: string | null
    notes: string | null
    deliverables: { title: string; description: string | null }[]
    tasks: { title: string; phase: string | null; completed: boolean }[]
  } | null
  client: {
    id: string
    name: string
    contact: string | null
    phone: string | null
    email: string | null
    industry: string | null
    sells: string | null
    notes: string | null
  } | null
  emails: { heading: string; summary: string | null; receivedAt: string }[]
}

/** The NZ day of a stored event date. Date-only rows are UTC midnight. */
export function eventDay(stamp: string): string {
  if (/T00:00:00(\.0+)?(\+00:00|Z)$/.test(stamp)) return stamp.slice(0, 10)
  return new Date(stamp).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
}

export async function getShootPack(db: Db, eventId: string): Promise<ShootPack | null> {
  const embed = `job_id, client_id, jobs(id, name, job_type, notes, shoot_location, client_id,
    deliverables(title, description), job_tasks(title, phase, completed, sort_order))`
  let res = await db.from('events')
    .select(`id, title, date, start_time, end_time, notes, shot_list, shot_list_at, ${embed}`)
    .eq('id', eventId).maybeSingle()
  // Before the shoot_pack migration has run there is no shot_list column, and
  // asking for it fails the whole query. Ask again without it.
  if (res.error) {
    res = await db.from('events').select(`id, title, date, start_time, end_time, notes, ${embed}`).eq('id', eventId).maybeSingle()
  }
  const ev = res.data
  if (!ev) return null

  const job = ev.jobs as null | {
    id: string; name: string; job_type: string | null; notes: string | null; shoot_location: string | null; client_id: string | null
    deliverables: { title: string; description: string | null }[] | null
    job_tasks: { title: string; phase: string | null; completed: boolean; sort_order: number | null }[] | null
  }
  const clientId: string | null = ev.client_id ?? job?.client_id ?? null

  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const [clientRes, emailsRes] = await Promise.all([
    clientId
      ? db.from('clients').select('id, name, contact_person, phone, email, industry, sells, notes, location').eq('id', clientId).maybeSingle()
      : Promise.resolve({ data: null }),
    clientId
      ? db.from('client_emails').select('heading, summary, received_at').eq('client_id', clientId).gte('received_at', since).order('received_at', { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
  ])
  const c = clientRes.data as null | {
    id: string; name: string; contact_person: string | null; phone: string | null; email: string | null
    industry: string | null; sells: string | null; notes: string | null; location: string | null
  }

  // Where to go: the job's location, else an address-looking event note, else
  // the client's own location.
  const noteLooksLikeAddress = ev.notes && /\d+\s+\w+.*(road|rd|street|st|ave|avenue|drive|dr|lane|ln|place|pl|way|crescent|cres|terrace|tce|highway|hwy)\b/i.test(ev.notes)
  const address = job?.shoot_location || (noteLooksLikeAddress ? ev.notes : null) || c?.location || null

  return {
    eventId: ev.id,
    title: ev.title,
    day: eventDay(ev.date),
    startTime: ev.start_time,
    endTime: ev.end_time,
    eventNotes: ev.notes,
    shotList: ev.shot_list ?? null,
    shotListAt: ev.shot_list_at ?? null,
    address,
    job: job
      ? {
          id: job.id,
          name: job.name,
          jobType: job.job_type,
          notes: job.notes,
          deliverables: job.deliverables ?? [],
          tasks: (job.job_tasks ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
        }
      : null,
    client: c
      ? { id: c.id, name: c.name, contact: c.contact_person, phone: c.phone, email: c.email, industry: c.industry, sells: c.sells, notes: c.notes }
      : null,
    emails: ((emailsRes.data ?? []) as { heading: string; summary: string | null; received_at: string }[])
      .map((e) => ({ heading: e.heading, summary: e.summary, receivedAt: e.received_at })),
  }
}

/** Shoots on a NZ day, for the Today row. */
export async function shootsOn(db: Db, day: string): Promise<{ id: string; title: string; startTime: string | null; day: string }[]> {
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString()
  const to = new Date(Date.parse(`${day}T00:00:00Z`) + 2 * 86400000).toISOString()
  const { data } = await db.from('events').select('id, title, date, start_time').eq('event_type', 'shoot').gte('date', from).lt('date', to)
  return ((data ?? []) as { id: string; title: string; date: string; start_time: string | null }[])
    .map((e) => ({ id: e.id, title: e.title, startTime: e.start_time, day: eventDay(e.date) }))
    .filter((e) => e.day === day)
}

const SHOT_LIST_SYSTEM = `You plan shoots for Arlo, a solo videographer in Nelson, New Zealand (Tui Media: short social videos and event films for local businesses; weddings under his own name). Write the shot list he will look at on his phone on the morning of the shoot.

Work only from what you are given. Never invent names, places, products or times. Where the brief is thin, keep the shots general rather than guessing specifics.

Format, plain text, no markdown headings, no em dashes:
- One short line on what this shoot is for.
- Then for each video to make (from the deliverables, or a sensible split if there are none): the video's name on its own line, followed by 4 to 8 shots as "- " bullets, each a few words (e.g. "- Wide of the yard as the crew arrives").
- Then "Don't forget:" with up to 3 bullets for practical things the brief mentions (permissions, a person to film, timing).
Keep it tight: he is holding a camera.`

export async function writeShotList(db: Db, eventId: string): Promise<{ ok: true; shotList: string } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'No Anthropic key set.' }
  const pack = await getShootPack(db, eventId)
  if (!pack) return { ok: false, error: 'That shoot is gone.' }

  const brief = [
    `Shoot: ${pack.title} on ${pack.day}${pack.startTime ? ` at ${pack.startTime}` : ''}${pack.endTime ? ` until ${pack.endTime}` : ''}`,
    pack.address && `Where: ${pack.address}`,
    pack.eventNotes && `Calendar notes: ${pack.eventNotes}`,
    pack.client && `Client: ${pack.client.name}${pack.client.industry ? ` (${pack.client.industry})` : ''}${pack.client.sells ? `, sells ${pack.client.sells}` : ''}`,
    pack.client?.notes && `Client notes:\n${pack.client.notes.slice(0, 2500)}`,
    pack.job && `Job: ${pack.job.name}${pack.job.jobType ? ` (${pack.job.jobType})` : ''}`,
    pack.job?.notes && `Job notes:\n${pack.job.notes.slice(0, 2500)}`,
    pack.job?.deliverables.length && `Deliverables:\n${pack.job.deliverables.map((d) => `- ${d.title}${d.description ? `: ${d.description}` : ''}`).join('\n')}`,
    pack.emails.length && `Recent client emails:\n${pack.emails.map((e) => `- ${e.heading}${e.summary ? `: ${e.summary}` : ''}`).join('\n')}`,
  ].filter(Boolean).join('\n\n')

  try {
    const anthropic = new Anthropic({ apiKey })
    const res = await anthropic.messages.create({
      // Thinking draws on max_tokens; low effort with room to spare, as in
      // the chat route.
      model: 'claude-haiku-5-5',
      output_config: { effort: 'low' },
      max_tokens: 3000,
      system: SHOT_LIST_SYSTEM,
      messages: [{ role: 'user', content: `${brief}\n\nWrite the shot list.` }],
    })
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim().replace(/\s*[—–]\s*/g, ', ')
    if (!text) return { ok: false, error: 'The shot list came back empty.' }
    await db.from('events').update({ shot_list: text, shot_list_at: new Date().toISOString() }).eq('id', eventId)
    return { ok: true, shotList: text }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not write the shot list.' }
  }
}
