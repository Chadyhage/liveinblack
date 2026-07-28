'use client'

import { useRouter } from 'next/navigation'
import TicketWalletPanel, { type TicketWalletGroupView } from '../TicketWallet'

// Fine wrapper client : TicketWalletPanel garde son prop `onBack` existant
// (utilisé auparavant pour revenir à l'état local `panel=null`), qui pointe
// maintenant vers la vraie route /profile.
export default function BilletsClient({ groups, currentUserId }: { groups: TicketWalletGroupView[]; currentUserId: string }) {
  const router = useRouter()
  return <TicketWalletPanel groups={groups} currentUserId={currentUserId} onBack={() => router.push('/profile')} />
}
