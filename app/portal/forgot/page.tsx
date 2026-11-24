import type { Metadata } from 'next'
import PortalAuthShell from '../PortalAuthShell'
import ForgotPasswordForm from './ForgotPasswordForm'
import { brandTitle } from '@/lib/brand'

type Search = Promise<{ brand?: string }>

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { brand } = await searchParams
  return { title: brandTitle('Reset your password', brand) }
}

export default async function PortalForgotPage({ searchParams }: { searchParams: Search }) {
  const { brand } = await searchParams
  return (
    <PortalAuthShell
      title="Reset your password"
      intro="Enter the email you sign in with and we’ll send a link to choose a new password."
      brand={brand}
    >
      <ForgotPasswordForm brand={brand ?? null} />
    </PortalAuthShell>
  )
}
