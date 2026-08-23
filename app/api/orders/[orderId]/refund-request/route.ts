import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requestClientRefund } from '@/lib/server/payments/clientRefunds'

export async function POST(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { orderId } = await params
  const result = await requestClientRefund({ id: session.user.id }, orderId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, refunded: result.refunded })
}
