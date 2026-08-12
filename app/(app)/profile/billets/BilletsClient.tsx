'use client'

import TicketWalletPanel, { type TicketWalletGroupView } from '../TicketWallet'

export default function BilletsClient({ groups, currentUserId }: { groups: TicketWalletGroupView[]; currentUserId: string }) {
  return <TicketWalletPanel groups={groups} currentUserId={currentUserId} />
}
