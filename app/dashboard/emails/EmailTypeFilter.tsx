'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import CustomSelect from '@/components/CustomSelect'

const EMAIL_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'proposal_accepted', label: 'Proposal Accepted' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'revision', label: 'Revision' },
  { value: 'approval', label: 'Approval' },
]

export default function EmailTypeFilter() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const currentType = searchParams.get('type') || 'all'

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') {
      params.set('type', value)
    } else {
      params.delete('type')
    }
    startTransition(() => {
      router.push(`/dashboard/emails?${params.toString()}`)
    })
  }

  return (
    <div style={{ minWidth: '180px', opacity: isPending ? 0.7 : 1 }}>
      <CustomSelect
        value={currentType}
        onChange={handleChange}
        options={EMAIL_TYPES}
      />
    </div>
  )
}
