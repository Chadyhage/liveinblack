'use client'

import { useState } from 'react'
import { fmtMoney } from '@/lib/shared/money'
import { Button, Input, Select, Checkbox, Label } from '@/app/components/ui'
import { useQueryParamState } from '@/lib/client/useQueryParamState'

export interface PlaceView {
  id: string
  type: string
  price: number
  available: number
  groupType: 'solo' | 'group'
  groupMin: number | null
  groupMax: number | null
}

export interface AgentSalesDashboardView {
  totalSales: number
  cashPending: number
  cashSettled: number
  momoSales: number
}

const cardStyle: React.CSSProperties = { padding: '16px 18px', borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--border)' }

export default function AgentSalesClient({
  eventId,
  eventName,
  currency,
  places,
  initialDashboard,
}: {
  eventId: string
  eventName: string
  currency: 'EUR' | 'XOF'
  places: PlaceView[]
  initialDashboard: AgentSalesDashboardView
}) {
  const [mode, setMode] = useQueryParamState<'onsite' | 'door'>('mode', 'onsite')
  const [placeId, setPlaceId] = useState(places[0]?.id || '')
  const [qty, setQty] = useState(1)
  const [isTable, setIsTable] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [method, setMethod] = useState<'cash' | 'momo'>('cash')
  const [settlementMode, setSettlementMode] = useState<'instant_debit' | 'agent_settles'>('agent_settles')
  const [momoNumber, setMomoNumber] = useState('')
  const [momoCountry, setMomoCountry] = useState('TG')
  const [momoMode, setMomoMode] = useState<'mtn' | 'moov' | 'mtn_ci' | 'moov_tg'>('moov_tg')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [dashboard, setDashboard] = useState(initialDashboard)

  const selectedPlace = places.find((p) => p.id === placeId) || null

  async function refreshDashboard() {
    const res = await fetch(`/api/agent-sales/${eventId}/dashboard`)
    const data = await res.json().catch(() => null)
    if (res.ok && data?.ok) setDashboard(data.view)
  }

  async function handleSubmit() {
    if (!placeId) return
    if (!contactEmail.trim() && !contactPhone.trim()) {
      setResult({ kind: 'err', text: 'Renseigne au moins un email ou un numéro de téléphone pour envoyer le billet.' })
      return
    }
    // Sans cette garde, un numéro Momo vide passait quand même — le serveur
    // décrémente déjà le stock avant de rejeter la vente, un champ oublié
    // consommait donc une place pour rien (bug confirmé par audit).
    if (method === 'momo' && !momoNumber.trim()) {
      setResult({ kind: 'err', text: 'Renseigne le numéro Mobile Money du client.' })
      return
    }
    setBusy(true)
    setResult(null)
    try {
      const endpoint = mode === 'door' ? `/api/agent-sales/${eventId}/sell-at-door` : `/api/agent-sales/${eventId}/sell`
      const body: Record<string, unknown> = {
        placeId,
        guestName: guestName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        method,
      }
      if (mode === 'onsite') {
        body.qty = qty
        body.isTable = isTable
      }
      if (method === 'cash') {
        body.settlementMode = settlementMode
      } else {
        body.momoMode = momoMode
        body.momoPhone = { number: momoNumber.trim(), country: momoCountry }
      }
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        if (data.status === 'paid') setResult({ kind: 'ok', text: `Billet(s) généré(s) : ${data.ticketCodes.join(', ')}` })
        else if (data.status === 'pending_cash_settlement') setResult({ kind: 'ok', text: 'Vente enregistrée — en attente de règlement de la part LIVE IN BLACK avant génération du billet.' })
        else if (data.status === 'pending_momo_confirmation') setResult({ kind: 'ok', text: 'Demande envoyée sur le téléphone du client — le billet sera généré dès sa confirmation Mobile Money.' })
        setGuestName('')
        setContactEmail('')
        setContactPhone('')
        setMomoNumber('')
        await refreshDashboard()
      } else {
        setResult({ kind: 'err', text: SALE_ERROR_LABELS[data?.error as string] || 'Vente impossible pour le moment.' })
      }
    } catch {
      setResult({ kind: 'err', text: 'Erreur réseau — réessaie.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '28px 20px 60px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>Vente sur place</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 0 20px' }}>{eventName}</p>

      <div className="lb-responsive-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        <div style={cardStyle}>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal)', margin: 0 }}>{dashboard.totalSales}</p>
          <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>Vendus</p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)', margin: 0 }}>{dashboard.cashPending}</p>
          <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>Cash en attente</p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', margin: 0 }}>{dashboard.cashSettled}</p>
          <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>Cash réglé</p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--violet)', margin: 0 }}>{dashboard.momoSales}</p>
          <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>Mobile Money</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Button
          variant={mode === 'onsite' ? 'primary' : 'secondary'}
          onClick={() => setMode('onsite')}
          fullWidth
          style={{ flex: 1, borderRadius: 8 }}
        >
          Vente (avant soirée)
        </Button>
        <Button
          variant={mode === 'door' ? 'primary' : 'secondary'}
          onClick={() => setMode('door')}
          fullWidth
          style={{ flex: 1, borderRadius: 8 }}
        >
          Vente à l&apos;entrée (rapide)
        </Button>
      </div>

      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Label>Type de place</Label>
          <Select
            value={placeId}
            onChange={(v) => setPlaceId(v)}
            options={places.map((p) => ({
              value: p.id,
              label: `${p.type} — ${fmtMoney(p.price, currency)} (${p.available} restantes)`,
              disabled: p.available <= 0,
            }))}
          />
        </div>

        {mode === 'onsite' && selectedPlace?.groupType === 'group' && (
          <Checkbox
            checked={isTable}
            onChange={(e) => setIsTable(e.target.checked)}
            label={`Vente de la place de groupe entière (forfait à prix fixe, ${selectedPlace.groupMin}-${selectedPlace.groupMax} pers.)`}
          />
        )}

        {mode === 'onsite' && !isTable && (
          <div>
            <Label>Nombre de billets</Label>
            <Input type="number" min={1} max={20} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <Label>Nom (optionnel)</Label>
            <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Nom du client" />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="ton@email.com" />
          </div>
        </div>
        <div>
          <Label>Téléphone {!contactEmail.trim() ? '(email ou téléphone requis)' : '(optionnel)'}</Label>
          <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+228 90 00 00 00" />
        </div>

        <div>
          <Label>Moyen de paiement</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="secondary"
              onClick={() => setMethod('cash')}
              fullWidth
              style={{ flex: 1, borderRadius: 8, background: method === 'cash' ? 'var(--gold)' : 'var(--obsidian)', color: method === 'cash' ? '#1a1508' : 'var(--text)' }}
            >
              Espèces
            </Button>
            <Button
              variant="secondary"
              onClick={() => setMethod('momo')}
              fullWidth
              style={{ flex: 1, borderRadius: 8, background: method === 'momo' ? 'var(--gold)' : 'var(--obsidian)', color: method === 'momo' ? '#1a1508' : 'var(--text)' }}
            >
              Mobile Money
            </Button>
          </div>
        </div>

        {method === 'cash' && (
          <div>
            <Label>Règlement de la part LIVE IN BLACK</Label>
            <Select
              value={settlementMode}
              onChange={(v) => setSettlementMode(v as typeof settlementMode)}
              options={[
                { value: 'agent_settles', label: 'Je règle moi-même numériquement' },
                { value: 'instant_debit', label: 'Prélèvement immédiat sur le solde organisateur' },
              ]}
            />
          </div>
        )}

        {method === 'momo' && (
          <div className="lb-responsive-metrics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <Label>Opérateur</Label>
              <Select
                value={momoMode}
                onChange={(v) => setMomoMode(v as typeof momoMode)}
                options={[
                  { value: 'moov_tg', label: 'Moov Togo' },
                  { value: 'mtn_ci', label: 'MTN Côte d’Ivoire' },
                  { value: 'mtn', label: 'MTN Bénin' },
                  { value: 'moov', label: 'Moov Bénin' },
                ]}
              />
            </div>
            <div>
              <Label>Pays</Label>
              <Input value={momoCountry} onChange={(e) => setMomoCountry(e.target.value.toUpperCase())} placeholder="TG" maxLength={2} />
            </div>
            <div>
              <Label>Numéro Momo</Label>
              <Input value={momoNumber} onChange={(e) => setMomoNumber(e.target.value)} placeholder="90000000" />
            </div>
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={!placeId}
          loading={busy}
          loadingText="Traitement…"
          size="lg"
        >
          Encaisser la vente
        </Button>

        {result && <p style={{ fontSize: 12.5, color: result.kind === 'ok' ? 'var(--teal)' : '#e05aaa', margin: 0, lineHeight: 1.5 }}>{result.text}</p>}
      </div>
    </main>
  )
}

const SALE_ERROR_LABELS: Record<string, string> = {
  insufficient_stock: 'Plus de place disponible pour ce type.',
  contact_required: 'Un email ou un numéro de téléphone est requis pour envoyer le billet.',
  momo_phone_required: 'Numéro Mobile Money requis.',
  momo_requires_xof_event: 'Le Mobile Money n’est disponible que pour les événements en FCFA.',
  event_cancelled: 'Cet événement est annulé.',
  event_ended: 'Cet événement est déjà terminé.',
  forbidden: 'Tu n’es pas autorisé à vendre des billets pour cet événement.',
  too_many_unpaid_cash_sales: 'Trop de ventes espèces en attente de règlement — régule tes ventes en attente avant d’en vendre de nouvelles.',
  fedapay_error: 'La demande Mobile Money n’a pas pu être envoyée — réessaie ou passe en espèces.',
  place_not_found: 'Cette place n’existe plus — recharge la page.',
  not_a_group_place: 'Cette place n’est pas une place de groupe.',
  no_group_at_door: 'La vente de groupe n’est pas disponible en vente à l’entrée.',
  order_creation_failed: 'Impossible de créer la commande — réessaie.',
  organizer_unresolved: 'Organisateur introuvable pour cet événement — contacte le support.',
  event_not_found: 'Cet événement est introuvable.',
  internal_error: 'Erreur interne — réessaie.',
}
