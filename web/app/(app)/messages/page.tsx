import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listMyConversations, listBlockedUsers, listMyReports, listStarredMessages } from '@/lib/server/messaging'
import { listMyFriendRequests, listFriends } from '@/lib/server/friends'
import MessagesClient from './MessagesClient'

// Server Component : charge l'état initial (conversations, demandes d'ami,
// liste d'amis) via un accès base privilégié direct — exactement comme
// app/ticket/[token]/page.tsx appelle getTicketDisplay directement. Le
// composant client, lui, ne parle qu'aux routes HTTP pour toute interaction
// ultérieure (polling, envoi, réactions, sondages, groupes...).
export const metadata: Metadata = {
  title: 'Messages — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function MessagesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const caller = { id: session.user.id }
  const [conversationsResult, requestsResult, friendsResult, blockedResult, reportsResult, starredResult] = await Promise.all([
    listMyConversations(caller),
    listMyFriendRequests(caller),
    listFriends(caller),
    listBlockedUsers(caller),
    listMyReports(caller),
    listStarredMessages(caller),
  ])

  const initialConversations = conversationsResult.ok ? conversationsResult.conversations : []
  const initialReceived = requestsResult.ok ? requestsResult.received : []
  const initialSent = requestsResult.ok ? requestsResult.sent : []
  const initialFriends = friendsResult.ok ? friendsResult.friends : []
  const initialBlocked = blockedResult.ok ? blockedResult.blocked : []
  const initialReports = reportsResult.ok ? reportsResult.reports : []
  const initialStarred = starredResult.ok ? starredResult.messages : []

  return (
    <MessagesClient
      currentUserId={session.user.id}
      initialConversations={initialConversations}
      initialReceived={initialReceived}
      initialSent={initialSent}
      initialFriends={initialFriends}
      initialBlocked={initialBlocked}
      initialReports={initialReports}
      initialStarred={initialStarred}
    />
  )
}
