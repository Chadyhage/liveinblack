import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import mongoose from 'mongoose'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import { getAgentSalesDashboard } from '@/lib/server/agentSales'
import AgentSalesClient, { type PlaceView } from './AgentSalesClient'

// Espace agent DE VENTE (#C — rôle EventStaff 'vendeur') — nom délibérément
// distinct de app/(app)/agent (staff LIVE IN BLACK, concept totalement
// différent) pour ne jamais confondre les deux dans l'URL/le code.
export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params
  await getDb()
  const event = mongoose.isValidObjectId(eventId) ? await Event.findById(eventId).select('name').lean() : null
  return {
    title: event ? `Vente sur place — ${event.name} — LIVEINBLACK` : 'Vente sur place — LIVEINBLACK',
    robots: { index: false, follow: false },
  }
}

// Icône/mise en page alignées sur le GateScreen de scanner/[eventId]/page.tsx
// (même famille d'écran de garde staff-only) — elles avaient divergé, l'une
// avec l'icône ronde rose, l'autre non.
function GateScreen({ title, message }: { title: string; message: string }) {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            margin: '0 auto 22px',
            background: 'rgba(224,90,170,0.08)',
            border: '2px solid rgba(224,90,170,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AlertCircle size={32} strokeWidth={1.8} color="var(--pink)" aria-hidden="true" />
        </div>
        <p style={{ fontWeight: 800, fontSize: 22, color: 'var(--pink)', margin: '0 0 10px' }}>{title}</p>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>{message}</p>
        <Link href="/home" style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>
          ← Accueil
        </Link>
      </div>
    </main>
  )
}

export default async function AgentSalesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params

  const session = await auth()
  if (!session?.user) redirect('/login')

  await getDb()
  const event = mongoose.isValidObjectId(eventId) ? await Event.findById(eventId).lean() : null
  if (!event) return <GateScreen title="Événement introuvable" message="Cet événement n'existe pas ou plus." />

  const dashboardResult = await getAgentSalesDashboard({ id: session.user.id }, eventId)
  if (!dashboardResult.ok) {
    return <GateScreen title="Accès refusé" message="Tu dois être désigné agent de vente (rôle « Vente sur place ») pour cet événement." />
  }

  const places: PlaceView[] = (event.places || []).map((p) => ({
    id: p.id,
    type: p.type,
    price: p.price ?? 0,
    available: p.available ?? 0,
    groupType: p.groupType === 'group' ? 'group' : 'solo',
    groupMin: p.groupMin ?? null,
    groupMax: p.groupMax ?? null,
  }))

  return (
    <AgentSalesClient
      eventId={eventId}
      eventName={event.name}
      currency={event.currency === 'XOF' ? 'XOF' : 'EUR'}
      places={places}
      initialDashboard={dashboardResult.view}
    />
  )
}
