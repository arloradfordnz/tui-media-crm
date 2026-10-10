import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getContractTemplate } from '@/lib/document-templates'
import TemplateEditor from './TemplateEditor'

export default async function ContractTemplatePage() {
  const supabase = await createServerSupabaseClient()
  const template = await getContractTemplate(supabase)

  return (
    <div className="space-y-6">
      <Link href="/dashboard/documents" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Documents
      </Link>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Contract template</h1>
          <p className="page-subtitle">Every new contract starts from this wording. Fill the [square brackets] per client.</p>
        </div>
      </div>
      <TemplateEditor initialBody={template.body} />
    </div>
  )
}
