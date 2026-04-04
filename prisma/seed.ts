import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const db = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  // ── Admin user ─────────────────────────────────────────────
  const existing = await db.user.findUnique({ where: { email: 'hello@tuimedia.nz' } })
  if (!existing) {
    const password = await bcrypt.hash('Hezpyv-9dutqo-cabjij', 12)
    await db.user.create({
      data: { email: 'hello@tuimedia.nz', name: 'Tui Media Admin', password, role: 'admin' },
    })
    console.log('✓ Admin account created (hello@tuimedia.nz)')
  }

  // ── Clients ────────────────────────────────────────────────
  const clientsData = [
    { name: 'Sarah & James Mitchell', email: 'sarah.mitchell@gmail.com', phone: '+64 21 345 678', location: 'Queenstown', leadSource: 'Referral', pipelineStage: 'booked', status: 'active', lifetimeValue: 5500, tags: '["Wedding","Premium"]', firstContact: new Date('2026-02-15') },
    { name: 'Meridian Energy', email: 'marketing@meridian.co.nz', phone: '+64 4 381 1200', location: 'Wellington', leadSource: 'Website', pipelineStage: 'contract', status: 'active', lifetimeValue: 12000, tags: '["Corporate","Ongoing"]', firstContact: new Date('2025-11-20') },
    { name: 'Tom & Lisa Chen', email: 'tom.chen@hotmail.com', phone: '+64 27 999 1234', location: 'Auckland', leadSource: 'Social Media', pipelineStage: 'enquiry', status: 'lead', lifetimeValue: 0, tags: '["Anniversary"]', firstContact: new Date('2026-03-28') },
  ]

  const clients = []
  for (const c of clientsData) {
    const exists = await db.client.findFirst({ where: { email: c.email } })
    if (!exists) {
      clients.push(await db.client.create({ data: c }))
    } else {
      clients.push(exists)
    }
  }
  console.log(`✓ ${clients.length} clients`)

  // ── Job Templates ──────────────────────────────────────────
  const templates = [
    {
      jobType: 'wedding', name: 'Wedding',
      tasks: [
        { phase: 'preshoot', title: 'Send client questionnaire', sortOrder: 0 },
        { phase: 'preshoot', title: 'Scout venue / plan shots', sortOrder: 1 },
        { phase: 'preshoot', title: 'Charge all batteries', sortOrder: 2 },
        { phase: 'preshoot', title: 'Pack gear (see pack list)', sortOrder: 3 },
        { phase: 'shootday', title: 'Arrive 1 hr early for setup', sortOrder: 4 },
        { phase: 'shootday', title: 'Film getting ready', sortOrder: 5 },
        { phase: 'shootday', title: 'Film ceremony', sortOrder: 6 },
        { phase: 'shootday', title: 'Capture couple portraits', sortOrder: 7 },
        { phase: 'shootday', title: 'Film speeches and first dance', sortOrder: 8 },
        { phase: 'postproduction', title: 'Import and backup footage', sortOrder: 9 },
        { phase: 'postproduction', title: 'Rough cut edit', sortOrder: 10 },
        { phase: 'postproduction', title: 'Colour grade', sortOrder: 11 },
        { phase: 'postproduction', title: 'Sound mix and music sync', sortOrder: 12 },
        { phase: 'delivery', title: 'Send first cut via portal', sortOrder: 13 },
        { phase: 'delivery', title: 'Apply revisions', sortOrder: 14 },
        { phase: 'delivery', title: 'Deliver final files', sortOrder: 15 },
      ],
      deliverables: [
        { title: 'Highlight Film (3–5 min)', sortOrder: 0 },
        { title: 'Full Ceremony Edit', sortOrder: 1 },
        { title: 'Speeches Edit', sortOrder: 2 },
      ],
    },
    {
      jobType: 'anniversary', name: 'Anniversary & Couples',
      tasks: [
        { phase: 'preshoot', title: 'Confirm location and outfit', sortOrder: 0 },
        { phase: 'preshoot', title: 'Pack gear', sortOrder: 1 },
        { phase: 'shootday', title: 'Film couple session', sortOrder: 2 },
        { phase: 'postproduction', title: 'Edit highlight film', sortOrder: 3 },
        { phase: 'delivery', title: 'Send for review', sortOrder: 4 },
        { phase: 'delivery', title: 'Deliver final', sortOrder: 5 },
      ],
      deliverables: [
        { title: 'Couples Highlight Film (2–3 min)', sortOrder: 0 },
      ],
    },
    {
      jobType: 'corporate', name: 'Corporate',
      tasks: [
        { phase: 'preshoot', title: 'Brief and storyboard with client', sortOrder: 0 },
        { phase: 'preshoot', title: 'Scout location', sortOrder: 1 },
        { phase: 'preshoot', title: 'Prepare interview questions', sortOrder: 2 },
        { phase: 'shootday', title: 'Set up lighting and audio', sortOrder: 3 },
        { phase: 'shootday', title: 'Film interviews', sortOrder: 4 },
        { phase: 'shootday', title: 'Capture B-roll', sortOrder: 5 },
        { phase: 'postproduction', title: 'Edit first cut', sortOrder: 6 },
        { phase: 'postproduction', title: 'Add graphics and lower thirds', sortOrder: 7 },
        { phase: 'delivery', title: 'Client review', sortOrder: 8 },
        { phase: 'delivery', title: 'Final delivery with all formats', sortOrder: 9 },
      ],
      deliverables: [
        { title: 'Corporate Video (2–4 min)', sortOrder: 0 },
        { title: 'Social Media Cut (60s)', sortOrder: 1 },
      ],
    },
    {
      jobType: 'event', name: 'Event',
      tasks: [
        { phase: 'preshoot', title: 'Confirm event run sheet', sortOrder: 0 },
        { phase: 'preshoot', title: 'Pack gear for run-and-gun', sortOrder: 1 },
        { phase: 'shootday', title: 'Film event coverage', sortOrder: 2 },
        { phase: 'postproduction', title: 'Edit recap video', sortOrder: 3 },
        { phase: 'delivery', title: 'Deliver files', sortOrder: 4 },
      ],
      deliverables: [
        { title: 'Event Recap Video', sortOrder: 0 },
      ],
    },
    {
      jobType: 'realestate', name: 'Real Estate',
      tasks: [
        { phase: 'preshoot', title: 'Confirm property access and staging', sortOrder: 0 },
        { phase: 'shootday', title: 'Film interior walk-through', sortOrder: 1 },
        { phase: 'shootday', title: 'Capture exterior and drone shots', sortOrder: 2 },
        { phase: 'postproduction', title: 'Edit property video', sortOrder: 3 },
        { phase: 'delivery', title: 'Deliver to agent', sortOrder: 4 },
      ],
      deliverables: [
        { title: 'Property Walk-through Video', sortOrder: 0 },
        { title: 'Social Media Teaser', sortOrder: 1 },
      ],
    },
    {
      jobType: 'custom', name: 'Custom',
      tasks: [
        { phase: 'preshoot', title: 'Define scope and deliverables', sortOrder: 0 },
        { phase: 'shootday', title: 'Film content', sortOrder: 1 },
        { phase: 'postproduction', title: 'Edit', sortOrder: 2 },
        { phase: 'delivery', title: 'Deliver', sortOrder: 3 },
      ],
      deliverables: [
        { title: 'Custom Deliverable', sortOrder: 0 },
      ],
    },
  ]

  for (const tmpl of templates) {
    const exists = await db.jobTemplate.findUnique({ where: { jobType: tmpl.jobType } })
    if (!exists) {
      await db.jobTemplate.create({
        data: {
          jobType: tmpl.jobType,
          name: tmpl.name,
          templateTasks: { create: tmpl.tasks },
          templateDeliverables: { create: tmpl.deliverables },
        },
      })
    }
  }
  console.log('✓ Job templates created')

  // ── Jobs ───────────────────────────────────────────────────
  const jobsData = [
    { clientIdx: 0, name: 'Mitchell Wedding — Highlight Film', jobType: 'wedding', status: 'editing', shootDate: new Date('2026-03-22'), shootLocation: 'Stoneridge Estate, Queenstown', quoteValue: 5500 },
    { clientIdx: 1, name: 'Meridian Energy — Brand Film', jobType: 'corporate', status: 'preproduction', shootDate: new Date('2026-04-15'), shootLocation: 'Meridian HQ, Wellington', quoteValue: 8000 },
    { clientIdx: 1, name: 'Meridian Energy — Social Content Q1', jobType: 'corporate', status: 'delivered', shootDate: new Date('2026-01-20'), shootLocation: 'Various, Wellington', quoteValue: 4000 },
    { clientIdx: 0, name: 'Mitchell Engagement Shoot', jobType: 'anniversary', status: 'delivered', shootDate: new Date('2026-01-10'), shootLocation: 'Lake Hayes, Queenstown', quoteValue: 1200 },
    { clientIdx: 2, name: 'Chen Anniversary — Enquiry', jobType: 'anniversary', status: 'enquiry', shootDate: null, shootLocation: null, quoteValue: 2000 },
  ]

  for (const j of jobsData) {
    const existingJob = await db.job.findFirst({ where: { name: j.name } })
    if (!existingJob) {
      const job = await db.job.create({
        data: {
          clientId: clients[j.clientIdx].id,
          name: j.name,
          jobType: j.jobType,
          status: j.status,
          shootDate: j.shootDate,
          shootLocation: j.shootLocation,
          quoteValue: j.quoteValue,
        },
      })

      // Copy template tasks
      const tmpl = await db.jobTemplate.findUnique({
        where: { jobType: j.jobType },
        include: { templateTasks: true, templateDeliverables: true },
      })
      if (tmpl) {
        for (const t of tmpl.templateTasks) {
          await db.jobTask.create({ data: { jobId: job.id, phase: t.phase, title: t.title, sortOrder: t.sortOrder, completed: j.status === 'delivered' } })
        }
        for (const d of tmpl.templateDeliverables) {
          await db.deliverable.create({ data: { jobId: job.id, title: d.title, description: d.description, completed: j.status === 'delivered' } })
        }
      }
    }
  }
  console.log('✓ 5 sample jobs created')

  // ── Events ─────────────────────────────────────────────────
  const eventsData = [
    { title: 'Mitchell Wedding Shoot', eventType: 'shoot', date: new Date('2026-03-22'), startTime: '10:00', endTime: '20:00' },
    { title: 'Meridian Pre-production Call', eventType: 'call', date: new Date('2026-04-07'), startTime: '14:00', endTime: '15:00' },
    { title: 'Meridian Brand Film Shoot', eventType: 'shoot', date: new Date('2026-04-15'), startTime: '08:00', endTime: '17:00' },
    { title: 'Chen Discovery Call', eventType: 'call', date: new Date('2026-04-10'), startTime: '11:00', endTime: '11:30' },
    { title: 'Mitchell First Cut Deadline', eventType: 'deadline', date: new Date('2026-04-08'), startTime: null, endTime: null },
  ]

  for (const e of eventsData) {
    const exists = await db.event.findFirst({ where: { title: e.title } })
    if (!exists) {
      await db.event.create({ data: e })
    }
  }
  console.log('✓ Calendar events created')

  // ── Gear ───────────────────────────────────────────────────
  const gearData = [
    { name: 'Sony FX6', category: 'camera', purchaseValue: 9500, insuranceValue: 10000, serialNumber: 'SN-FX6-001', status: 'available' },
    { name: 'Sony A7S III', category: 'camera', purchaseValue: 5200, insuranceValue: 5500, serialNumber: 'SN-A7S3-002', status: 'available' },
    { name: 'Sony 24-70mm f/2.8 GM II', category: 'lens', purchaseValue: 3600, insuranceValue: 3800, serialNumber: 'SN-2470-001', status: 'available' },
    { name: 'Sony 70-200mm f/2.8 GM II', category: 'lens', purchaseValue: 4200, insuranceValue: 4500, serialNumber: 'SN-70200-001', status: 'available' },
    { name: 'Rode NTG5', category: 'audio', purchaseValue: 750, insuranceValue: 800, serialNumber: 'SN-NTG5-001', status: 'available' },
    { name: 'Sennheiser EW 112P G4', category: 'audio', purchaseValue: 900, insuranceValue: 950, serialNumber: 'SN-EW112-001', status: 'available' },
    { name: 'Aputure 600d Pro', category: 'lighting', purchaseValue: 2800, insuranceValue: 3000, serialNumber: 'SN-600D-001', status: 'in_service', notes: 'Sent for repair — fan issue' },
    { name: 'DJI RS 3 Pro', category: 'accessories', purchaseValue: 1200, insuranceValue: 1300, serialNumber: 'SN-RS3P-001', status: 'available' },
  ]

  for (const g of gearData) {
    const exists = await db.gear.findFirst({ where: { serialNumber: g.serialNumber } })
    if (!exists) {
      await db.gear.create({ data: g })
    }
  }
  console.log('✓ 8 gear items created')

  // ── Documents ──────────────────────────────────────────────
  const docsData = [
    { name: 'Wedding Service Agreement', docType: 'contract', content: '# Wedding Videography Service Agreement\n\nBetween Tui Media and [Client Name]\n\n## Services\n- Full day wedding videography coverage\n- Highlight film (3-5 minutes)\n- Full ceremony edit\n- Speeches edit\n\n## Payment Terms\n- 50% deposit to secure date\n- Remaining 50% due 7 days before event\n\n## Deliverables\nAll files delivered within 8 weeks of wedding date via secure client portal.\n\n## Revisions\nTwo rounds of revisions included.\n\n---\nSigned: ________________  Date: ________' },
  ]

  for (const d of docsData) {
    const exists = await db.document.findFirst({ where: { name: d.name } })
    if (!exists) {
      await db.document.create({ data: d })
    }
  }
  console.log('✓ Document template created')

  // ── Activity ───────────────────────────────────────────────
  const actCount = await db.activity.count()
  if (actCount === 0) {
    await db.activity.createMany({
      data: [
        { action: 'job_created', details: 'Mitchell Wedding — Highlight Film created', clientId: clients[0].id },
        { action: 'status_changed', details: 'Mitchell Wedding moved to Editing', clientId: clients[0].id },
        { action: 'job_created', details: 'Meridian Brand Film created', clientId: clients[1].id },
        { action: 'delivery_sent', details: 'Meridian Social Content Q1 delivered', clientId: clients[1].id },
        { action: 'job_created', details: 'Chen Anniversary — Enquiry created', clientId: clients[2].id },
      ],
    })
    console.log('✓ Activity log seeded')
  }

  console.log('\n✅ Database seeded successfully!')
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
