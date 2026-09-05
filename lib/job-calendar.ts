// Keep the calendar honest about shoots.
//
// Booking a shoot set jobs.shoot_date and stopped there. The calendar reads
// the events table, so the one date in the business that is genuinely
// immovable — someone else's diary, a crew, a location — was the one date the
// calendar did not know about. The shoot showed up on the job record, on the
// jobs list, in the assistant's context, and nowhere you would actually look
// to answer "what am I doing on Thursday".
//
// This mirrors shoot_date into a single events row per job. It is a mirror,
// not a copy: the job is the source of truth, and the event is derived, so
// moving the shoot moves the event and clearing the shoot removes it.

type Supa = any // eslint-disable-line @typescript-eslint/no-explicit-any

const SHOOT_EVENT_TYPE = 'shoot'

/**
 * Reconcile the shoot event for one job against its current shoot_date.
 *
 * Idempotent, and safe to call after any job write — including ones that
 * changed nothing about the date. Failures are logged and swallowed: a
 * calendar row is not worth failing a job save over, and the next save
 * reconciles it anyway.
 */
export async function syncShootEvent(supabase: Supa, jobId: string): Promise<void> {
  try {
    const { data: job } = await supabase
      .from('jobs')
      .select('id, name, shoot_date, shoot_location, clients(name)')
      .eq('id', jobId)
      .single()

    if (!job) return

    const { data: existing } = await supabase
      .from('events')
      .select('id, date, start_time, end_time, notes')
      .eq('job_id', jobId)
      .eq('event_type', SHOOT_EVENT_TYPE)
      .limit(1)
      .maybeSingle()

    // Shoot date cleared, or never set: there is nothing to be on the
    // calendar. Removing rather than leaving a stale entry, because a shoot
    // that is no longer booked showing up on Thursday is worse than nothing.
    if (!job.shoot_date) {
      if (existing) await supabase.from('events').delete().eq('id', existing.id)
      return
    }

    const clientName = (job.clients as { name?: string } | null)?.name
    const title = clientName ? `${clientName} — ${job.name}` : job.name

    if (existing) {
      await supabase
        .from('events')
        .update({
          title,
          date: job.shoot_date,
          // start_time and end_time are deliberately untouched. They are only
          // ever set by hand on the calendar, and the job has no idea what
          // time of day the shoot is — overwriting them here would erase the
          // one piece of information the calendar knows and the job doesn't.
          notes: job.shoot_location || existing.notes || null,
        })
        .eq('id', existing.id)
      return
    }

    await supabase.from('events').insert({
      job_id: jobId,
      title,
      event_type: SHOOT_EVENT_TYPE,
      date: job.shoot_date,
      notes: job.shoot_location || null,
    })
  } catch (err) {
    console.error('[job-calendar] shoot sync failed for', jobId, err)
  }
}

/**
 * Remove a job's shoot event before the job itself goes.
 *
 * events.job_id is ON DELETE SET NULL, so without this a deleted job leaves a
 * detached shoot sitting on the calendar with nothing behind it and no way to
 * tell what it was for.
 */
export async function removeShootEvent(supabase: Supa, jobId: string): Promise<void> {
  try {
    await supabase.from('events').delete().eq('job_id', jobId).eq('event_type', SHOOT_EVENT_TYPE)
  } catch (err) {
    console.error('[job-calendar] shoot cleanup failed for', jobId, err)
  }
}
