'use client'

import { useEffect, useMemo, useState } from 'react'
import { fmtMoney } from '@/lib/shared/money'
import { Button, Pagination, SkeletonRow, pagedSlice, EmptyState, Modal } from '@/app/components/ui'
import AgentBoostsClient from '@/app/components/AgentBoostsClient'
import { useQueryParamState } from '@/lib/client/useQueryParamState'

const PAGE_SIZE = 15

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

// `details` vient de sources d'alerte hétérogènes (webhook Stripe/FedaPay,
// cron de versement…) sans schéma commun exhaustif à mapper vers des
// libellés — on affiche donc chaque paire clé/valeur lisiblement (clé
// humanisée, valeur brute) plutôt qu'un blob JSON.stringify() d'un bloc.
function humanizeDetailKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())
}
function fmtDetailValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
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

// 'boosts' n'a pas de file d'action (lecture seule, voir AgentBoostsClient) —
// fusionné ici depuis l'ancienne route /agent/boosts, qui était strictement
// une vue sans filtre ni action, à sa place naturelle à côté des autres
// files financières plutôt que dans sa propre entrée de sidebar.
const SECTIONS = [
  { key: 'payouts', label: 'Reversements' },
  { key: 'refunds', label: 'Remboursements' },
  { key: 'alerts', label: 'Alertes paiement' },
  { key: 'boosts', label: 'Boosts' },
] as const
type SectionKey = (typeof SECTIONS)[number]['key']

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }
const sectionTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '3.2px', color: 'var(--teal)', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 10px' }
const btnBase: React.CSSProperties = { borderRadius: 3, fontWeight: 500, fontSize: 13, textTransform: 'none', letterSpacing: 'normal', width: '100%' }
const tealBtn: React.CSSProperties = { ...btnBase, background: 'var(--teal)', color: 'var(--obsidian)' }
const ghostBtn: React.CSSProperties = { ...btnBase, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-strong)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'none', letterSpacing: 'normal' }

export default function AgentPaymentsClient() {
  // Onglet reflété dans l'URL (?section=) — un lien vers "Alertes paiement"
  // ou "Boosts" doit rester partageable, pas seulement atteignable en
  // cliquant depuis Paiements.
  const [section, setSection] = useQueryParamState<SectionKey>('section', 'payouts')

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

  const [failedPayoutsPage, setFailedPayoutsPage] = useState(1)
  const [payoutRequestsPage, setPayoutRequestsPage] = useState(1)
  const [balancesNoReqPage, setBalancesNoReqPage] = useState(1)
  const [refundsPage, setRefundsPage] = useState(1)
  const [alertsPage, setAlertsPage] = useState(1)

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
      setFailedPayoutsPage(1)
      setPayoutRequestsPage(1)
      setBalancesNoReqPage(1)
      setRefundsPage(1)
      setAlertsPage(1)
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
          setFailedPayoutsPage(1)
          setPayoutRequestsPage(1)
          setBalancesNoReqPage(1)
          setRefundsPage(1)
          setAlertsPage(1)
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

  // 'boosts' n'a pas de compteur ici (AgentBoostsClient charge et affiche ses
  // propres totaux dans son panneau) — 0 fixe, jamais mis en avant en rose.
  const counts = { payouts: failedPayouts.length + payoutRequests.length + balancesNoReq.length, refunds: refunds.length, alerts: alerts.length, boosts: 0 }

  return (
    <main className="lb-dashboard-page">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h1 className="font-display lb-dashboard-title">Paiements</h1>

        {loadError && (
          <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Lecture impossible d&apos;une obligation financière. Aucune action de règlement n&apos;est proposée tant que les montants réels ne sont pas connus — recharge la page.
            </p>
            <Button variant="secondary" onClick={loadAll} style={{ fontSize: 12.5, flexShrink: 0 }}>
              Recharger
            </Button>
          </div>
        )}

        <div className="lb-responsive-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {SECTIONS.map((s) => {
            const active = s.key === section
            const count = counts[s.key]
            return (
              <Button
                key={s.key}
                variant="ghost"
                onClick={() => setSection(s.key)}
                style={{
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
                  background: active ? 'rgba(184, 243, 74,0.14)' : 'var(--surface)',
                  textAlign: 'left',
                  display: 'block',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, color: count > 0 ? '#e05aaa' : 'var(--text-faint)' }}>{count}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: active ? 'var(--gold)' : 'var(--text-faint)' }}>{s.label}</div>
              </Button>
            )
          })}
        </div>

        {section === 'boosts' ? (
          <AgentBoostsClient embedded />
        ) : loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} columns={2} />
            ))}
          </div>
        ) : section === 'payouts' ? (
          <PayoutsSection
            failedPayouts={failedPayouts}
            payoutRequests={payoutRequests}
            balancesNoReq={balancesNoReq}
            setConfirm={setConfirm}
            failedPayoutsPage={failedPayoutsPage}
            setFailedPayoutsPage={setFailedPayoutsPage}
            payoutRequestsPage={payoutRequestsPage}
            setPayoutRequestsPage={setPayoutRequestsPage}
            balancesNoReqPage={balancesNoReqPage}
            setBalancesNoReqPage={setBalancesNoReqPage}
          />
        ) : section === 'refunds' ? (
          <RefundsSection refunds={refunds} setConfirm={setConfirm} page={refundsPage} setPage={setRefundsPage} />
        ) : (
          <AlertsSection alerts={alerts} setConfirm={setConfirm} page={alertsPage} setPage={setAlertsPage} />
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
  failedPayoutsPage,
  setFailedPayoutsPage,
  payoutRequestsPage,
  setPayoutRequestsPage,
  balancesNoReqPage,
  setBalancesNoReqPage,
}: {
  failedPayouts: FailedPayout[]
  payoutRequests: PayoutRequestView[]
  balancesNoReq: SellerBalanceView[]
  setConfirm: (a: ConfirmAction) => void
  failedPayoutsPage: number
  setFailedPayoutsPage: (p: number) => void
  payoutRequestsPage: number
  setPayoutRequestsPage: (p: number) => void
  balancesNoReqPage: number
  setBalancesNoReqPage: (p: number) => void
}) {
  const empty = failedPayouts.length === 0 && payoutRequests.length === 0 && balancesNoReq.length === 0

  const { pageItems: failedPayoutsPageItems, pageCount: failedPayoutsPageCount } = useMemo(
    () => pagedSlice(failedPayouts, failedPayoutsPage, PAGE_SIZE),
    [failedPayouts, failedPayoutsPage]
  )
  const { pageItems: payoutRequestsPageItems, pageCount: payoutRequestsPageCount } = useMemo(
    () => pagedSlice(payoutRequests, payoutRequestsPage, PAGE_SIZE),
    [payoutRequests, payoutRequestsPage]
  )
  const { pageItems: balancesNoReqPageItems, pageCount: balancesNoReqPageCount } = useMemo(
    () => pagedSlice(balancesNoReq, balancesNoReqPage, PAGE_SIZE),
    [balancesNoReq, balancesNoReqPage]
  )

  if (empty) {
    return (
      <EmptyState title="Aucun reversement en attente" description="Les soldes vendeurs non reversés automatiquement apparaîtront ici." />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ ...cardStyle, background: 'rgba(184, 243, 74,0.06)', borderColor: 'rgba(184, 243, 74,0.3)' }}>
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
            {failedPayoutsPageItems.map((p) => (
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
                  <Button variant="primary" style={{ ...tealBtn, marginTop: 12, background: 'rgba(184, 243, 74,0.16)', border: '1px solid rgba(184, 243, 74,0.5)', color: 'var(--primary)' }} onClick={() => setConfirm({ type: 'markPayoutPaid', eventId: p.eventId, label: fmtXOF(p.amountDueXOF), who: p.sellerName })}>
                    Marquer payé ({fmtXOF(p.amountDueXOF)})
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Pagination page={failedPayoutsPage} pageCount={failedPayoutsPageCount} onPageChange={setFailedPayoutsPage} totalItems={failedPayouts.length} pageSize={PAGE_SIZE} />
        </div>
      )}

      {payoutRequests.length > 0 && (
        <div>
          <p style={sectionTitleStyle}>Demandes de virement — EUR ({payoutRequests.length})</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {payoutRequestsPageItems.map((r) => (
              <PayoutCard key={r.requestId} sellerUid={r.sellerUid} sellerName={r.sellerName} sellerEmail={r.sellerEmail} amountDueCents={r.amountDueCents} amountDueXOF={r.amountDueXOF} payCents={r.payCents} requestId={r.requestId} requestedAt={r.requestedAt} mismatch={r.mismatch} setConfirm={setConfirm} />
            ))}
          </div>
          <Pagination page={payoutRequestsPage} pageCount={payoutRequestsPageCount} onPageChange={setPayoutRequestsPage} totalItems={payoutRequests.length} pageSize={PAGE_SIZE} />
        </div>
      )}

      {balancesNoReq.length > 0 && (
        <div>
          <p style={sectionTitleStyle}>Soldes dus — sans demande ({balancesNoReq.length})</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {balancesNoReqPageItems.map((b) => (
              <PayoutCard key={b.sellerUid} sellerUid={b.sellerUid} sellerName={b.sellerName} sellerEmail={b.sellerEmail} amountDueCents={b.amountDueCents} amountDueXOF={b.amountDueXOF} payCents={b.amountDueCents} requestId={null} requestedAt={null} mismatch={false} setConfirm={setConfirm} />
            ))}
          </div>
          <Pagination page={balancesNoReqPage} pageCount={balancesNoReqPageCount} onPageChange={setBalancesNoReqPage} totalItems={balancesNoReq.length} pageSize={PAGE_SIZE} />
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
    <div style={{ ...cardStyle, borderColor: requestId ? 'rgba(184, 243, 74,0.3)' : 'var(--border)' }}>
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
        <Button variant="primary" style={{ ...tealBtn, marginTop: 12 }} onClick={() => setConfirm({ type: 'settle', sellerUid, requestId, amount: payCents, currency: 'EUR', label: fmtEUR(payCents), who: sellerName })}>
          Marquer payé ({fmtEUR(payCents)})
        </Button>
      )}

      {amountDueXOF > 0 && (
        <p
          style={{
            marginTop: payCents > 0 ? 8 : 12,
            padding: '9px 12px',
            borderRadius: 10,
            background: 'rgba(184, 243, 74,0.07)',
            border: '1px solid rgba(184, 243, 74,0.2)',
            color: 'rgba(184, 243, 74,0.85)',
            fontSize: 10.5,
            lineHeight: 1.5,
          }}
        >
          {fmtXOF(amountDueXOF)} versés automatiquement sur le Mobile Money à la fin de l&apos;événement. En cas d&apos;échec, à régler dans « Versements auto en échec ».
        </p>
      )}

      {requestId && payCents <= 0 && amountDueXOF <= 0 && (
        <Button variant="secondary" style={{ ...ghostBtn, marginTop: 12 }} onClick={() => setConfirm({ type: 'closeRequest', requestId, who: sellerName })}>
          Solde à zéro — clore la demande
        </Button>
      )}
    </div>
  )
}

// ──────────────────────────── Remboursements ────────────────────────────────

function RefundsSection({
  refunds,
  setConfirm,
  page,
  setPage,
}: {
  refunds: RefundAlert[]
  setConfirm: (a: ConfirmAction) => void
  page: number
  setPage: (p: number) => void
}) {
  const { pageItems, pageCount } = useMemo(() => pagedSlice(refunds, page, PAGE_SIZE), [refunds, page])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 4px', lineHeight: 1.55 }}>
        FedaPay ne rembourse pas par API. Pour chaque ligne : rembourse l&apos;acheteur dans le dashboard FedaPay (bouton « Refund » sur la transaction), puis marque-la comme
        faite ici. L&apos;argent d&apos;un événement annulé n&apos;est jamais versé à l&apos;organisateur — il reste disponible pour rembourser. Les paiements par carte
        (Stripe) sont, eux, remboursés automatiquement.
      </p>
      {refunds.length === 0 ? (
        <EmptyState title="Aucun remboursement mobile money en attente" description="Les remboursements FedaPay à traiter manuellement apparaîtront ici." />
      ) : (
        pageItems.map((r) => (
          <div key={r.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>{fmtXOF(r.amountXOF)}</p>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>À : {r.buyerEmail || '— email inconnu —'}</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>Transaction FedaPay : {r.paymentRef}</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '2px 0 0' }}>Événement : {r.eventName}</p>
                <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>{fmtDate(r.createdAt)}</p>
              </div>
              <Button variant="primary" style={{ flexShrink: 0, width: 'auto', borderRadius: 3, fontWeight: 500, padding: '10px 14px', fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }} onClick={() => setConfirm({ type: 'completeRefund', refundId: r.id, label: fmtXOF(r.amountXOF), who: r.buyerEmail || 'cet acheteur' })}>
                Marquer remboursé
              </Button>
            </div>
          </div>
        ))
      )}
      {refunds.length > 0 && <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={refunds.length} pageSize={PAGE_SIZE} />}
    </div>
  )
}

// ──────────────────────────── Alertes paiement ──────────────────────────────

function AlertsSection({
  alerts,
  setConfirm,
  page,
  setPage,
}: {
  alerts: PaymentAlertView[]
  setConfirm: (a: ConfirmAction) => void
  page: number
  setPage: (p: number) => void
}) {
  const { pageItems, pageCount } = useMemo(() => pagedSlice(alerts, page, PAGE_SIZE), [alerts, page])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 4px', lineHeight: 1.55 }}>Vérifie le paiement dans Stripe ou FedaPay avant de rembourser ou de clôturer l&apos;alerte.</p>
      {alerts.length === 0 ? (
        <EmptyState title="Aucune anomalie à traiter" description="Les paiements signalés comme anormaux apparaîtront ici." />
      ) : (
        pageItems.map((a) => (
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
              {Object.keys(a.details).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {Object.entries(a.details).map(([key, value]) => (
                    <p key={key} style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0, overflowWrap: 'anywhere' }}>
                      {humanizeDetailKey(key)} : {fmtDetailValue(value)}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <Button variant="primary" style={{ marginTop: 13, width: 'auto', padding: '10px 16px', borderRadius: 3, fontWeight: 500, border: '1px solid rgba(255,255,255,0.14)', textTransform: 'none', letterSpacing: 'normal', fontSize: 12 }} onClick={() => setConfirm({ type: 'resolveAlert', alertId: a.id, label: ALERT_REASON_LABEL[a.reason] || a.reason })}>
              Marquer comme examiné
            </Button>
          </div>
        ))
      )}
      {alerts.length > 0 && <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={alerts.length} pageSize={PAGE_SIZE} />}
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
    <Modal onClose={busy ? () => {} : onCancel} maxWidth={400} hideClose contentStyle={{ textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>{title}</p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 18px', lineHeight: 1.5 }}>{helper}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="secondary" onClick={onCancel} disabled={busy} style={ghostBtn}>
          Annuler
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={busy} loading={busy} loadingText="…" style={tealBtn}>
          Confirmer
        </Button>
      </div>
    </Modal>
  )
}
