import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { SupportPanel } from '../profile/ProfilClient'

export const metadata: Metadata = {
  title: 'Aide & FAQ — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function HelpPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return <SupportPanel />
}
