'use client'

import { useRouter } from 'next/navigation'
import { SupportPanel } from '../ProfilClient'

export default function AideClient() {
  const router = useRouter()
  return <SupportPanel onBack={() => router.push('/profile')} />
}
