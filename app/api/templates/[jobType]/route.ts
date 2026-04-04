import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ jobType: string }> }) {
  const { jobType } = await params

  const template = await db.jobTemplate.findUnique({
    where: { jobType },
    include: {
      templateTasks: { orderBy: { sortOrder: 'asc' } },
      templateDeliverables: { orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!template) {
    return NextResponse.json({ tasks: [], deliverables: [] })
  }

  return NextResponse.json({
    tasks: template.templateTasks.map((t) => ({ phase: t.phase, title: t.title })),
    deliverables: template.templateDeliverables.map((d) => ({ title: d.title, description: d.description })),
  })
}
