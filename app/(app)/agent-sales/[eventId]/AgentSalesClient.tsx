'use client'

import { useState } from 'react'
import { fmtMoney } from '@/lib/shared/money'

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

const inputStyle: React.CSSProperties = { padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%' }
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', margin: '0 0 4px' }
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
  const [mode, setMode] = useState<'onsite' | 'door'>('onsite')
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        <div style={cardStyle}>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal)', margin: 0 }}>{dashboard.totalSales}</p>
          <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>Vendus</p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)', margin: 0 }}>{dashboard.cashPending}</p>
          <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>Cash en attente</p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 20, fontWeight: 800, color: '#4ee8c8', margin: 0 }}>{dashboard.cashSettled}</p>
          <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>Cash réglé</p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--violet)', margin: 0 }}>{dashboard.momoSales}</p>
          <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>Mobile Money</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setMode('onsite')} style={{ ...inputStyle, width: 'auto', flex: 1, cursor: 'pointer', background: mode === 'onsite' ? 'var(--teal-solid)' : 'var(--surface)', color: mode === 'onsite' ? '#04120e' : 'var(--text)', fontWeight: 700 }}>
          Vente (avant soirée)
        </button>
        <button onClick={() => setMode('door')} style={{ ...inputStyle, width: 'auto', flex: 1, cursor: 'pointer', background: mode === 'door' ? 'var(--teal-solid)' : 'var(--surface)', color: mode === 'door' ? '#04120e' : 'var(--text)', fontWeight: 700 }}>
          Vente à l&apos;entrée (rapide)
        </button>
      </div>

      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Type de place</label>
          <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} style={inputStyle}>
            {places.map((p) => (
              <option key={p.id} value={p.id} disabled={p.available <= 0}>
                {p.type} — {fmtMoney(p.price, currency)} ({p.available} restantes)
              </option>
            ))}
          </select>
        </div>

        {mode === 'onsite' && selectedPlace?.groupType === 'group' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={isTable} onChange={(e) => setIsTable(e.target.checked)} />
            Vente de la place de groupe entière (forfait à prix fixe, {selectedPlace.groupMin}-{selectedPlace.groupMax} pers.)
          </label>
        )}

        {mode === 'onsite' && !isTable && (
          <div>
            <label style={labelStyle}>Nombre de billets</label>
            <input type="number" min={1} max={20} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} style={inputStyle} />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Nom (optionnel)</label>
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} style={inputStyle} placeholder="Nom du client" />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={inputStyle} placeholder="ton@email.com" />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Téléphone {!contactEmail.trim() ? '(email ou téléphone requis)' : '(optionnel)'}</label>
          <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={inputStyle} placeholder="+228 90 00 00 00" />
        </div>

        <div>
          <label style={labelStyle}>Moyen de paiement</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setMethod('cash')} style={{ ...inputStyle, width: 'auto', flex: 1, cursor: 'pointer', background: method === 'cash' ? 'var(--gold)' : 'var(--obsidian)', color: method === 'cash' ? '#1a1508' : 'var(--text)', fontWeight: 700 }}>
              Espèces
            </button>
            <button onClick={() => setMethod('momo')} style={{ ...inputStyle, width: 'auto', flex: 1, cursor: 'pointer', background: method === 'momo' ? 'var(--gold)' : 'var(--obsidian)', color: method === 'momo' ? '#1a1508' : 'var(--text)', fontWeight: 700 }}>
              Mobile Money
            </button>
          </div>
        </div>

        {method === 'cash' && (
          <div>
            <label style={labelStyle}>Règlement de la part LIVE IN BLACK</label>
            <select value={settlementMode} onChange={(e) => setSettlementMode(e.target.value as typeof settlementMode)} style={inputStyle}>
              <option value="agent_settles">Je règle moi-même numériquement</option>
              <option value="instant_debit">Prélèvement immédiat sur le solde organisateur</option>
            </select>
          </div>
        )}

        {method === 'momo' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Opérateur</label>
              <select value={momoMode} onChange={(e) => setMomoMode(e.target.value as typeof momoMode)} style={inputStyle}>
                <option value="moov_tg">Moov Togo</option>
                <option value="mtn_ci">MTN Côte d&apos;Ivoire</option>
                <option value="mtn">MTN Bénin</option>
                <option value="moov">Moov Bénin</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Pays</label>
              <input value={momoCountry} onChange={(e) => setMomoCountry(e.target.value.toUpperCase())} style={inputStyle} placeholder="TG" maxLength={2} />
            </div>
            <div>
              <label style={labelStyle}>Numéro Momo</label>
              <input value={momoNumber} onChange={(e) => setMomoNumber(e.target.value)} style={inputStyle} placeholder="90000000" />
            </div>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={busy || !placeId}
          style={{ padding: '13px 20px', borderRadius: 10, border: 'none', background: 'var(--teal-solid)', color: '#04120e', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
        >
          {busy ? 'Traitement…' : 'Encaisser la vente'}
        </button>

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
}
