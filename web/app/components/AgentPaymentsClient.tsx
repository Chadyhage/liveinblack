'use client'

import { useEffect, useState } from 'react'
import { fmtMoney } from '@/lib/shared/money'

// Port de la fusion des 3 onglets legacy 'reversements' / 'remboursements' /
// 'paiements' (src/pages/AgentPage.jsx) en un seul panneau (#9 phase
// agent/admin, tâche #102). Logique métier (calcul des soldes, décrément
// atomique, garde anti double-versement) déjà côté serveur — voir
// lib/server/agentPayments.ts. Ce composant ne fait qu'afficher les files
// d'attente et déclencher les 2-3 actions de règlement manuel, toujours
// derrière une confirmation explicite (argent réel qui bouge).
//
// `amountDueCents`/`amountDueCents` ledger sont stockés en CENTIMES (comme le
// legacy `seller_balances.amountDueCents`) — fmtMoney() attend un montant en
// unité majeure, d'où la conversion /100 ci-dessous pour l'EUR (jamais pour
// le XOF, qui n'a pas de sous-unité).
function fmtEUR(amountDueCents: number): string {
  return fmtMoney(amountDueCents / 100, 'EUR')
}
function fmtXOF(amountDueXOF: number): string {
  return fmtMoney(amountDueXOF, 'XOF')
}

interface FailedPayout {
  eventId: string
  eventName: string
  sellerUid: string
  sellerName: string
  sellerEmail: string
  amountDueXOF: number
  failReason: string | null
  eventCancelled: boolean
}

interface PayoutRequestView {
  requestId: string
  sellerUid: string
  sellerName: string
  sellerEmail: string
  requestedAt: string
  amountDueCents: number
  amountDueXOF: number
  payCents: number
  mismatch: boolean
}

interface SellerBalanceView {
  sellerUid: string
  sellerName: string
  sellerEmail: string
  amountDueCents: number
  amountDueXOF: number
}

interface RefundAlert {
  id: string
  eventId: string
  eventName: string
  paymentRef: string
  amountXOF: number
  buyerEmail: string
  createdAt: string
}

interface PaymentAlertView {
  id: string
  reason: string
  eventId: string | null
  eventName: string
  sellerUid: string | null
  sellerName: string
  sellerEmail: string
  details: Record<string, unknown>
  createdAt: string
}

const ALERT_REASON_LABEL: Record<string, string> = {
  auto_payout_failed: "Versement auto à l'organisateur ÉCHOUÉ — à régler à la main",
  boost_plan_missing: 'Boost payé mais formule introuvable',
  boost_price_mismatch: 'Boost activé au prix payé (le tarif avait changé depuis) — vérifier',
  boost_slot_lost: "Remboursement d'un boost (créneau perdu) à vérifier",
  amount_mismatch: 'Montant payé différent du montant attendu',
  paid_after_cancel: "Paiement reçu après annulation de l'événement",
  event_deleted_before_fulfillment: 'Paiement reçu pour un événement supprimé',
  group_membership_conflict: 'Conflit de place de groupe après paiement',
  sub_amount_mismatch: "Abonnement : montant payé différent du tarif",
  stripe_refund_failed: 'Remboursement carte (Stripe) ÉCHOUÉ',
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

interface ToastState {
  message: string
  kind: 'success' | 'error'
}

type ConfirmAction =
  | { type: 'markPayoutPaid'; eventId: string; label: string; who: string }
  | { type: 'settle'; sellerUid: string; requestId: string | null; amount: number; currency: 'EUR' | 'XOF'; label: string; who: string }
  | { type: 'closeRequest'; requestId: string; who: string }
  | { type: 'completeRefund'; refundId: string; label: string; who: string }
  | { type: 'resolveAlert'; alertId: string; label: string }

const SECTIONS = [
  { key: 'payouts', label: 'Reversements' },
  { key: 'refunds', label: 'Remboursements' },
  { key: 'alerts', label: 'Alertes paiement' },
] as const
type SectionKey = (typeof SECTIONS)[number]['key']

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }
const sectionTitleStyle: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', margin: '0 0 10px' }
const btnBase: React.CSSProperties = { padding: '11px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%' }
const tealBtn: React.CSSProperties = { ...btnBase, background: 'var(--teal)', color: 'var(--obsidian)' }
const ghostBtn: React.CSSProperties = { ...btnBase, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-strong)', color: 'var(--text-muted)', fontWeight: 600 }

export default function AgentPaymentsClient() {
  const [section, setSection] = useState<SectionKey>('payouts')

  const [failedPayouts, setFailedPayouts] = useState<FailedPayout[]>([])
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequestView[]>([])
  const [balancesNoReq, setBalancesNoReq] = useState<SellerBalanceView[]>([])
  const [refunds, setRefunds] = useState<RefundAlert[]>([])
  const [alerts, setAlerts] = useState<PaymentAlertView[]>([])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [confirm, setConfirm] = useState<ConfirmAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  function showToast(message: string, kind: ToastState['kind']) {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3500)
  }

  async function loadAll() {
    setLoading(true)
    setLoadError(false)
    try {
      const [payoutsRes, refundsRes, alertsRes] = await Promise.all([
        fetch('/api/agent/payments/payouts'),
        fetch('/api/agent/payments/refunds'),
        fetch('/api/agent/payments/alerts'),
      ])
      const [payoutsData, refundsData, alertsData] = await Promise.all([payoutsRes.json(), refundsRes.json(), alertsRes.json()])
      if (!payoutsRes.ok || !payoutsData.ok || !refundsRes.ok || !refundsData.ok || !alertsRes.ok || !alertsData.ok) throw new Error('load_failed')
      setFailedPayouts(payoutsData.failedPayouts)
      setPayoutRequests(payoutsData.payoutRequests)
      setBalancesNoReq(payoutsData.balancesNoReq)
      setRefunds(refundsData.refunds)
      setAlerts(alertsData.alerts)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setLoadError(false)
      try {
        const [payoutsRes, refundsRes, alertsRes] = await Promise.all([
          fetch('/api/agent/payments/payouts'),
          fetch('/api/agent/payments/refunds'),
          fetch('/api/agent/payments/alerts'),
        ])
        const [payoutsData, refundsData, alertsData] = await Promise.all([payoutsRes.json(), refundsRes.json(), alertsRes.json()])
        if (!payoutsRes.ok || !payoutsData.ok || !refundsRes.ok || !refundsData.ok || !alertsRes.ok || !alertsData.ok) throw new Error('load_failed')
        if (!cancelled) {
          setFailedPayouts(payoutsData.failedPayouts)
          setPayoutRequests(payoutsData.payoutRequests)
          setBalancesNoReq(payoutsData.balancesNoReq)
          setRefunds(refundsData.refunds)
          setAlerts(alertsData.alerts)
        }
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  async function runConfirm() {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.type === 'markPayoutPaid') {
        const res = await fetch('/api/agent/payments/payouts/mark-paid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: confirm.eventId }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) {
          if (data.error === 'not_failed') setFailedPayouts((prev) => prev.filter((p) => p.eventId !== confirm.eventId))
          showToast(data.error === 'not_failed' ? 'Reparti en automatique entre-temps — liste mise à jour.' : "Échec du marquage — rien n'a été décrémenté. Réessaie.", 'error')
        } else {
          setFailedPayouts((prev) => prev.filter((p) => p.eventId !== confirm.eventId))
          showToast(`Versement de ${fmtXOF(data.paid)} marqué payé`, 'success')
        }
      } else if (confirm.type === 'settle') {
        const res = await fetch('/api/agent/payments/payouts/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sellerUid: confirm.sellerUid, amount: confirm.amount, currency: confirm.currency, requestId: confirm.requestId }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) {
          showToast("Échec du règlement — rien n'a été décrémenté. Réessaie.", 'error')
        } else {
          if (confirm.requestId) setPayoutRequests((prev) => prev.filter((r) => r.requestId !== confirm.requestId))
          else setBalancesNoReq((prev) => prev.filter((b) => b.sellerUid !== confirm.sellerUid))
          showToast(data.paid > 0 ? `Reversement de ${fmtMoney(data.paid / 100, 'EUR')} marqué payé` : 'Demande close (solde déjà à zéro)', 'success')
        }
      } else if (confirm.type === 'closeRequest') {
        const res = await fetch('/api/agent/payments/payouts/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sellerUid: payoutRequests.find((r) => r.requestId === confirm.requestId)?.sellerUid, amount: 0, currency: 'EUR', requestId: confirm.requestId }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) {
          showToast('Échec — la demande reste ouverte. Réessaie.', 'error')
        } else {
          setPayoutRequests((prev) => prev.filter((r) => r.requestId !== confirm.requestId))
          showToast('Demande close (solde déjà à zéro)', 'success')
        }
      } else if (confirm.type === 'completeRefund') {
        const res = await fetch(`/api/agent/payments/refunds/${confirm.refundId}/complete`, { method: 'POST' })
        const data = await res.json()
        if (!res.ok || !data.ok) {
          showToast('Impossible de marquer le remboursement. Réessaie.', 'error')
        } else {
          setRefunds((prev) => prev.filter((r) => r.id !== confirm.refundId))
          showToast('Remboursement marqué comme effectué', 'success')
        }
      } else if (confirm.type === 'resolveAlert') {
        const res = await fetch(`/api/agent/payments/alerts/${confirm.alertId}/resolve`, { method: 'POST' })
        const data = await res.json()
        if (!res.ok || !data.ok) {
          showToast("Impossible de clôturer l'alerte. Réessaie.", 'error')
        } else {
          setAlerts((prev) => prev.filter((a) => a.id !== confirm.alertId))
          showToast('Alerte financière clôturée', 'success')
        }
      }
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  const counts = { payouts: failedPayouts.length + payoutRequests.length + balancesNoReq.length, refunds: refunds.length, alerts: alerts.length }

  return (
    <main style={{ minHeight: '100vh', padding: '32px 16px 80px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0 }}>Paiements</h1>

        {loadError && (
          <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Lecture impossible d&apos;une obligation financière. Aucune action de règlement n&apos;est proposée tant que les montants réels ne sont pas connus — recharge la page.
            </p>
            <button onClick={loadAll} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12.5, flexShrink: 0 }}>
              Recharger
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {SECTIONS.map((s) => {
            const active = s.key === section
            const count = counts[s.key]
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                style={{
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
                  background: active ? 'rgba(200,169,110,0.14)' : 'var(--surface)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, color: count > 0 ? '#e05aaa' : 'var(--text-faint)' }}>{count}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: active ? 'var(--gold)' : 'var(--text-faint)' }}>{s.label}</div>
              </button>
            )
          })}
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Chargement…</p>
        ) : section === 'payouts' ? (
          <PayoutsSection failedPayouts={failedPayouts} payoutRequests={payoutRequests} balancesNoReq={balancesNoReq} setConfirm={setConfirm} />
        ) : section === 'refunds' ? (
          <RefundsSection refunds={refunds} setConfirm={setConfirm} />
        ) : (
          <AlertsSection alerts={alerts} setConfirm={setConfirm} />
        )}
      </div>

      {confirm && <ConfirmModal action={confirm} busy={busy} onCancel={() => setConfirm(null)} onConfirm={runConfirm} />}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 80,
            padding: '10px 18px',
            borderRadius: 10,
            background: 'var(--surface-2)',
            border: `1px solid ${toast.kind === 'success' ? 'var(--teal)' : '#e05aaa'}`,
            color: '#fff',
            fontSize: 13,
            maxWidth: '90vw',
            textAlign: 'center',
          }}
        >
          {toast.message}
        </div>
      )}
    </main>
  )
}

// ──────────────────────────── Reversements ──────────────────────────────────

function PayoutsSection({
  failedPayouts,
  payoutRequests,
  balancesNoReq,
  setConfirm,
}: {
  failedPayouts: FailedPayout[]
  payoutRequests: PayoutRequestView[]
  balancesNoReq: SellerBalanceView[]
  setConfirm: (a: ConfirmAction) => void
}) {
  const empty = failedPayouts.length === 0 && payoutRequests.length === 0 && balancesNoReq.length === 0

  if (empty) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>Aucun reversement en attente</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Les soldes vendeurs non reversés automatiquement apparaîtront ici.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ ...cardStyle, background: 'rgba(200,169,110,0.06)', borderColor: 'rgba(200,169,110,0.3)' }}>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          Filet de sécurité. Le flux normal est le versement automatique — EUR via Stripe Connect, XOF via Mobile Money à la fin de chaque événement. Ci-dessous : les échecs
          de versement auto (XOF) et les soldes EUR/ledger hors Stripe Connect à régler à la main. Jamais d&apos;addition entre devises.
        </p>
      </div>

      {failedPayouts.length > 0 && (
        <div>
          <p style={sectionTitleStyle}>Versements auto en échec — XOF ({failedPayouts.length})</p>
          <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '0 0 10px', lineHeight: 1.5 }}>
            Envoie l&apos;argent à la main depuis le dashboard FedaPay, PUIS marque payé ici (ça solde aussi le ledger — le cron n&apos;y retouchera pas).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {failedPayouts.map((p) => (
              <div key={p.eventId} style={{ ...cardStyle, borderColor: 'rgba(224,90,170,0.3)', borderLeft: '3px solid rgba(224,90,170,0.6)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.eventName}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.sellerName}
                      {p.sellerEmail ? ` · ${p.sellerEmail}` : ''}
                    </p>
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal)', margin: 0, flexShrink: 0 }}>{fmtXOF(p.amountDueXOF)}</p>
                </div>
                {p.failReason && <p style={{ fontSize: 11, color: '#f59e0b', margin: '8px 0 0', lineHeight: 1.5 }}>Raison : {p.failReason}</p>}
                {p.eventCancelled ? (
                  <p
                    style={{
                      marginTop: 12,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(224,90,170,0.1)',
                      border: '1px solid rgba(224,90,170,0.4)',
                      color: 'rgba(224,90,170,0.95)',
                      fontSize: 11,
                      lineHeight: 1.5,
                    }}
                  >
                    Événement ANNULÉ (ou supprimé) — cette recette rembourse les acheteurs (section Remboursements). Ne rien verser à l&apos;organisateur.
                  </p>
                ) : (
                  <button style={{ ...tealBtn, marginTop: 12, background: 'rgba(78,232,200,0.16)', border: '1px solid rgba(78,232,200,0.5)', color: 'var(--teal)' }} onClick={() => setConfirm({ type: 'markPayoutPaid', eventId: p.eventId, label: fmtXOF(p.amountDueXOF), who: p.sellerName })}>
                    Marquer payé ({fmtXOF(p.amountDueXOF)})
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {payoutRequests.length > 0 && (
        <div>
          <p style={sectionTitleStyle}>Demandes de virement — EUR ({payoutRequests.length})</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {payoutRequests.map((r) => (
              <PayoutCard key={r.requestId} sellerUid={r.sellerUid} sellerName={r.sellerName} sellerEmail={r.sellerEmail} amountDueCents={r.amountDueCents} amountDueXOF={r.amountDueXOF} payCents={r.payCents} requestId={r.requestId} requestedAt={r.requestedAt} mismatch={r.mismatch} setConfirm={setConfirm} />
            ))}
          </div>
        </div>
      )}

      {balancesNoReq.length > 0 && (
        <div>
          <p style={sectionTitleStyle}>Soldes dus — sans demande ({balancesNoReq.length})</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {balancesNoReq.map((b) => (
              <PayoutCard key={b.sellerUid} sellerUid={b.sellerUid} sellerName={b.sellerName} sellerEmail={b.sellerEmail} amountDueCents={b.amountDueCents} amountDueXOF={b.amountDueXOF} payCents={b.amountDueCents} requestId={null} requestedAt={null} mismatch={false} setConfirm={setConfirm} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PayoutCard({
  sellerUid,
  sellerName,
  sellerEmail,
  amountDueCents,
  amountDueXOF,
  payCents,
  requestId,
  requestedAt,
  mismatch,
  setConfirm,
}: {
  sellerUid: string
  sellerName: string
  sellerEmail: string
  amountDueCents: number
  amountDueXOF: number
  payCents: number
  requestId: string | null
  requestedAt: string | null
  mismatch: boolean
  setConfirm: (a: ConfirmAction) => void
}) {
  return (
    <div style={{ ...cardStyle, borderColor: requestId ? 'rgba(200,169,110,0.3)' : 'var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 2px' }}>{sellerName}</p>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sellerEmail || sellerUid}
            {requestedAt ? ` · demandé le ${new Date(requestedAt).toLocaleDateString('fr-FR')}` : ''}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {amountDueCents > 0 && <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold)', margin: 0 }}>{fmtEUR(amountDueCents)}</p>}
          {amountDueXOF > 0 && <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--teal)', margin: 0 }}>{fmtXOF(amountDueXOF)}</p>}
          {amountDueCents <= 0 && amountDueXOF <= 0 && <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>Solde à zéro</p>}
        </div>
      </div>

      {mismatch && <p style={{ fontSize: 11, color: '#f59e0b', margin: '8px 0 0', lineHeight: 1.5 }}>Le montant demandé dépasse le solde réel du ledger — seul le solde réel sera réglé.</p>}

      {payCents > 0 && (
        <button style={{ ...tealBtn, marginTop: 12 }} onClick={() => setConfirm({ type: 'settle', sellerUid, requestId, amount: payCents, currency: 'EUR', label: fmtEUR(payCents), who: sellerName })}>
          Marquer payé ({fmtEUR(payCents)})
        </button>
      )}

      {amountDueXOF > 0 && (
        <p
          style={{
            marginTop: payCents > 0 ? 8 : 12,
            padding: '9px 12px',
            borderRadius: 10,
            background: 'rgba(78,232,200,0.07)',
            border: '1px solid rgba(78,232,200,0.2)',
            color: 'rgba(78,232,200,0.85)',
            fontSize: 10.5,
            lineHeight: 1.5,
          }}
        >
          {fmtXOF(amountDueXOF)} versés automatiquement sur le Mobile Money à la fin de l&apos;événement. En cas d&apos;échec, à régler dans « Versements auto en échec ».
        </p>
      )}

      {requestId && payCents <= 0 && amountDueXOF <= 0 && (
        <button style={{ ...ghostBtn, marginTop: 12 }} onClick={() => setConfirm({ type: 'closeRequest', requestId, who: sellerName })}>
          Solde à zéro — clore la demande
        </button>
      )}
    </div>
  )
}

// ──────────────────────────── Remboursements ────────────────────────────────

function RefundsSection({ refunds, setConfirm }: { refunds: RefundAlert[]; setConfirm: (a: ConfirmAction) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 4px', lineHeight: 1.55 }}>
        FedaPay ne rembourse pas par API. Pour chaque ligne : rembourse l&apos;acheteur dans le dashboard FedaPay (bouton « Refund » sur la transaction), puis marque-la comme
        faite ici. L&apos;argent d&apos;un événement annulé n&apos;est jamais versé à l&apos;organisateur — il reste disponible pour rembourser. Les paiements par carte
        (Stripe) sont, eux, remboursés automatiquement.
      </p>
      {refunds.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>Aucun remboursement mobile money en attente</p>
        </div>
      ) : (
        refunds.map((r) => (
          <div key={r.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>{fmtXOF(r.amountXOF)}</p>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>À : {r.buyerEmail || '— email inconnu —'}</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>Transaction FedaPay : {r.paymentRef}</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '2px 0 0' }}>Événement : {r.eventName}</p>
                <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>{fmtDate(r.createdAt)}</p>
              </div>
              <button style={{ flexShrink: 0, width: 'auto', background: 'var(--teal)', color: 'var(--obsidian)', border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }} onClick={() => setConfirm({ type: 'completeRefund', refundId: r.id, label: fmtXOF(r.amountXOF), who: r.buyerEmail || 'cet acheteur' })}>
                Marquer remboursé
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ──────────────────────────── Alertes paiement ──────────────────────────────

function AlertsSection({ alerts, setConfirm }: { alerts: PaymentAlertView[]; setConfirm: (a: ConfirmAction) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 4px', lineHeight: 1.55 }}>Vérifie le paiement dans Stripe ou FedaPay avant de rembourser ou de clôturer l&apos;alerte.</p>
      {alerts.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>Aucune anomalie à traiter</p>
        </div>
      ) : (
        alerts.map((a) => (
          <div key={a.id} style={{ ...cardStyle, padding: 18, borderColor: 'rgba(224,90,170,0.32)', borderLeft: '3px solid rgba(224,90,170,0.55)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 750, color: '#fff', margin: '0 0 5px' }}>{ALERT_REASON_LABEL[a.reason] || a.reason}</p>
                <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0 }}>{fmtDate(a.createdAt)}</p>
              </div>
              <span style={{ fontSize: 10, color: '#e05aaa', border: '1px solid rgba(224,90,170,0.35)', borderRadius: 999, padding: '4px 8px', flexShrink: 0 }}>À vérifier</span>
            </div>
            <div style={{ marginTop: 13, padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.035)' }}>
              {a.eventName && <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '0 0 5px' }}>Événement : {a.eventName}</p>}
              {a.sellerUid && (
                <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '0 0 5px' }}>
                  Organisateur : {a.sellerName || a.sellerUid}
                  {a.sellerEmail ? ` · ${a.sellerEmail}` : ''}
                </p>
              )}
              {Object.keys(a.details).length > 0 && <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0, overflowWrap: 'anywhere' }}>Détails : {JSON.stringify(a.details)}</p>}
            </div>
            <button style={{ marginTop: 13, width: 'auto', padding: '10px 16px', borderRadius: 10, cursor: 'pointer', background: 'var(--teal)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--obsidian)', fontWeight: 700, fontSize: 12 }} onClick={() => setConfirm({ type: 'resolveAlert', alertId: a.id, label: ALERT_REASON_LABEL[a.reason] || a.reason })}>
              Marquer comme examiné
            </button>
          </div>
        ))
      )}
    </div>
  )
}

// ──────────────────────────── Confirmation ──────────────────────────────────

function ConfirmModal({ action, busy, onCancel, onConfirm }: { action: ConfirmAction; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  let title = ''
  let helper = ''
  if (action.type === 'markPayoutPaid') {
    title = `Confirmer le versement de ${action.label} à ${action.who} ?`
    helper = "À faire APRÈS avoir envoyé l'argent sur son Mobile Money."
  } else if (action.type === 'settle') {
    title = `Confirmer le reversement de ${action.label} à ${action.who} ?`
    helper = "À faire APRÈS avoir envoyé le virement."
  } else if (action.type === 'closeRequest') {
    title = `Clore la demande de virement de ${action.who} ?`
    helper = 'Le solde réel du ledger est déjà à zéro — aucun argent ne sera envoyé.'
  } else if (action.type === 'completeRefund') {
    title = `Confirmer le remboursement de ${action.label} à ${action.who} ?`
    helper = "À faire APRÈS avoir exécuté le remboursement dans le dashboard FedaPay."
  } else {
    title = `Clôturer l'alerte « ${action.label} » ?`
    helper = 'À faire seulement après vérification du paiement dans Stripe ou FedaPay.'
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div onClick={busy ? undefined : onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} />
      <div style={{ position: 'relative', ...cardStyle, maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>{title}</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 18px', lineHeight: 1.5 }}>{helper}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} disabled={busy} style={{ ...ghostBtn, cursor: busy ? 'default' : 'pointer' }}>
            Annuler
          </button>
          <button onClick={onConfirm} disabled={busy} style={{ ...tealBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? '…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}
