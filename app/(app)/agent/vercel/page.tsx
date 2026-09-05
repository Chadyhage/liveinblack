import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import AgentVercelOpsClient from '@/app/components/features/agent/AgentVercelOpsClient'

export const metadata: Metadata = {
  title: 'Ops Vercel — Agent — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function AgentVercelOpsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!requireAgent(session.user)) redirect('/')

  return <AgentVercelOpsClient />
}
