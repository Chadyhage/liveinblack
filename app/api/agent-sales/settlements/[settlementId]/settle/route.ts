import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { settleCashSale } from '@/lib/server/agentSales'

export async function POST(_req: Request, { params }: { params: Promise<{ settlementId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { settlementId } = await params
  const result = await settleCashSale({ id: session.user.id }, settlementId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
