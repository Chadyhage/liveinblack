import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/mongoose'
import { releaseExpiredSeatHolds } from '@/lib/server/events/seatHolds'
import { releaseOrder } from '@/lib/server/events/orders'
import Order from '@/lib/models/Order'

// Sweep des blocages de place ('active') dont le solde n'a jamais été payé
// avant expiresAt — relâche la place, acompte non remboursé (décision
// produit). Même garde secret que les autres crons (échec fermé si absent).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/seat-holds] CRON_SECRET manquant — refus par défaut (échec fermé)')
    return NextResponse.json({ error: 'cron_not_configured' }, { status: 500 })
  }

  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  await getDb()
  const seatHolds = await releaseExpiredSeatHolds()

  // Filet de sécurité pour les commandes ('pending', stock déjà décrémenté)
  // dont l'expiration n'a jamais été vue par un webhook (checkout.session.
  // expired / transaction.updated) — le seul mécanisme de restock existant
  // avant cette fonction (bug confirmé par audit : une seule livraison de
  // webhook manquée ou en erreur laissait le stock décrémenté pour
  // toujours, sans aucun sweep de rattrapage, contrairement aux seat-holds
  // qui en avaient déjà un).
  const staleOrders = await Order.find({ status: 'pending', stockDecremented: true, expiresAt: { $lte: new Date() } })
    .select('_id')
    .lean()
  let ordersReleased = 0
  for (const order of staleOrders) {
    const result = await releaseOrder(String(order._id), null)
    if (result.ok) ordersReleased++
  }

  return NextResponse.json({ ...seatHolds, ordersReleased })
}
