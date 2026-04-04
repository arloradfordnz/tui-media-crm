import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import DocumentEditor from './DocumentEditor'

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const doc = await db.document.findUnique({ where: { id } })
  if (!doc) notFound()

  return <DocumentEditor doc={JSON.parse(JSON.stringify(doc))} />
}
