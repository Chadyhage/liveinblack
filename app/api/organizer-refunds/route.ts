import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listOrganizerRefundCases } from '@/lib/server/refunds/refundCases'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const refunds = await listOrganizerRefundCases(session.user.id, {
    eventId: searchParams.get('eventId'),
    status: searchParams.get('status'),
    flow: searchParams.get('flow'),
  })
  if (searchParams.get('format') === 'csv') {
    const header = ['id', 'eventId', 'orderId', 'cause', 'flow', 'status', 'amountXOF', 'paymentRail', 'destinationMasked', 'declaredReference', 'declaredChannel', 'createdAt'].join(',')
    const rows = refunds.map((refund) =>
      [
        refund.id,
        refund.eventId,
        refund.orderId,
        refund.cause,
        refund.flow,
        refund.status,
        refund.amountXOF,
        refund.paymentRail || '',
        refund.originalPaymentDestinationMasked || '',
        refund.declaredReference || '',
        refund.declaredChannel || '',
        refund.createdAt || '',
      ].map(csvCell).join(',')
    )
    return new Response([header, ...rows].join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="remboursements-liveinblack.csv"',
      },
    })
  }
  return NextResponse.json({ ok: true, refunds })
}

function csvCell(value: unknown): string {
  const raw = String(value ?? '')
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
}
