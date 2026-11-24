import type { Metadata } from 'next'
import PortalAuthShell from '../PortalAuthShell'
import PortalLoginForm from './PortalLoginForm'
import { brandIdentity, brandTitle } from '@/lib/brand'

type Search = Promise<{ error?: string; brand?: string }>

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { brand } = await searchParams
  return { title: brandTitle('Sign in', brand) }
}

const MESSAGES: Record<string, (email: string) => string> = {
  expired: () => 'That link has expired or was already used. Use “Forgot your password?” below to get a fresh one.',
  account: (email) => `That login isn’t linked to a client portal. Email ${email} and we’ll sort it out.`,
}

export default async function PortalLoginPage({ searchParams }: { searchParams: Search }) {
  const { error, brand } = await searchParams
  const id = brandIdentity(brand)
  const notice = error && MESSAGES[error] ? MESSAGES[error](id.contactEmail) : null

  return (
    <PortalAuthShell title="Sign in" intro="Access your projects, files and paperwork." brand={brand}>
      <PortalLoginForm notice={notice} brand={brand ?? null} />
    </PortalAuthShell>
  )
}
