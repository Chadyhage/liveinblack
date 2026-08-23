'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Landmark,
  Megaphone,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react'
import { fmtMoney } from '@/lib/shared/money'
import { Button, Card, Pagination, SkeletonRow, pagedSlice, EmptyState, Modal, ToastViewport } from '@/app/components/ui'
import AgentBoostsClient from '@/app/components/features/agent/AgentBoostsClient'
import { useQueryParamState } from '@/lib/client/useQueryParamState'
import styles from './AgentPaymentsClient.module.css'

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
  { key: 'payouts', label: 'Reversements', helper: 'À verser', color: '#f5c96a', icon: Landmark },
  { key: 'refunds', label: 'Remboursements', helper: 'À restituer', color: '#6dd7c8', icon: RotateCcw },
  { key: 'alerts', label: 'Alertes paiement', helper: 'À vérifier', color: '#ff8fb2', icon: ShieldCheck },
  { key: 'boosts', label: 'Boosts', helper: 'Suivi commercial', color: '#c4a7ff', icon: Megaphone },
] as const
type SectionKey = (typeof SECTIONS)[number]['key']

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
  const selectedSection = SECTIONS.find((item) => item.key === section) ?? SECTIONS[0]

  function handleSectionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % SECTIONS.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + SECTIONS.length) % SECTIONS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = SECTIONS.length - 1
    else return

    event.preventDefault()
    const nextSection = SECTIONS[nextIndex]
    setSection(nextSection.key)
    requestAnimationFrame(() => document.getElementById(`payment-tab-${nextSection.key}`)?.focus())
  }

  return (
    <main className={`lb-dashboard-page lb-agent-screen lb-agent-screen--payments ${styles.page}`}>
      <div className={styles.stack}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={loadAll} disabled={loading} className={styles.refresh} aria-label="Actualiser les données financières">
            Actualiser
          </Button>
        </div>

        {loadError && (
          <Card accent="rgba(255,143,178,0.35)" className={styles.error} role="alert">
            <div className={styles.errorCopy}>
              <AlertTriangle size={20} aria-hidden="true" />
              <div>
                <strong>Données financières indisponibles</strong>
                <p>Aucune action n&apos;est proposée tant que les montants réels ne sont pas connus.</p>
              </div>
            </div>
            <Button variant="secondary" icon={<RefreshCw size={15} aria-hidden="true" />} onClick={loadAll} aria-label="Réessayer de charger les données financières">
              Recharger
            </Button>
          </Card>
        )}

        <div className={styles.metrics} role="tablist" aria-label="Espaces de paiement" aria-orientation="horizontal">
          {SECTIONS.map((s, index) => {
            const active = s.key === section
            const count = counts[s.key]
            const Icon = s.icon
            return (
              <Button
                key={s.key}
                variant="ghost"
                onClick={() => setSection(s.key)}
                onKeyDown={(event) => handleSectionKeyDown(event, index)}
                className={`${styles.metric} ${active ? styles.metricActive : ''}`}
                style={{ '--metric-color': s.color } as React.CSSProperties}
                id={`payment-tab-${s.key}`}
                role="tab"
                aria-selected={active}
                aria-controls="payment-panel"
                aria-label={s.key === 'boosts' ? `${s.label}, ${s.helper}` : `${s.label}, ${count} en attente, ${s.helper}`}
                tabIndex={active ? 0 : -1}
              >
                <span className={styles.metricTop}>
                  <span className={styles.metricIcon} aria-hidden="true"><Icon size={19} /></span>
                  <span className={styles.metricValue} aria-hidden="true">{s.key === 'boosts' ? '↗' : count}</span>
                </span>
                <span className={styles.metricCopy}>
                  <strong>{s.label}</strong>
                  <small>{s.helper}</small>
                </span>
              </Button>
            )
          })}
        </div>

        <section
          className={styles.workspace}
          id="payment-panel"
          role="tabpanel"
          aria-labelledby={`payment-tab-${section}`}
          aria-busy={loading}
          tabIndex={0}
        >
          <div className={styles.sectionHeader}>
            <div>
              <p>{selectedSection.helper}</p>
              <h2 id="payment-section-title">{selectedSection.label}</h2>
            </div>
            {section !== 'boosts' && <span className={styles.sectionCount} aria-live="polite">{counts[section]} en attente</span>}
          </div>

          {section === 'boosts' ? (
            <div className={styles.boosts}><AgentBoostsClient embedded /></div>
          ) : loading ? (
            <div className={styles.loadingGrid} role="status" aria-live="polite">
              <span className={styles.srOnly}>Chargement des opérations financières…</span>
              {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} columns={2} />)}
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
        </section>
      </div>

      {confirm && <ConfirmModal action={confirm} busy={busy} onCancel={() => setConfirm(null)} onConfirm={runConfirm} />}

      <ToastViewport items={toast ? [{ id: 'paiements', message: toast.message, kind: toast.kind === 'success' ? 'success' : 'error' }] : []} />
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
    <div className={styles.sectionStack}>
      <Card accent="rgba(245,201,106,0.3)" className={styles.guideCard} role="note">
        <div className={styles.guideIcon} aria-hidden="true"><CircleDollarSign size={21} /></div>
        <div>
          <strong>Filet de sécurité des reversements</strong>
          <p>Les EUR transitent par Stripe Connect et les XOF par Mobile Money. Les opérations manuelles ci-dessous restent séparées par devise et doivent être confirmées après le transfert externe.</p>
        </div>
      </Card>

      {failedPayouts.length > 0 && (
        <div className={styles.queue}>
          <QueueHeader icon={<Smartphone size={18} aria-hidden="true" />} title="Versements Mobile Money en échec" description="À régler dans FedaPay avant de les marquer comme payés." count={failedPayouts.length} tone="danger" />
          <div className={styles.cardGrid}>
            {failedPayoutsPageItems.map((p) => (
              <Card key={p.eventId} accent="rgba(255,143,178,0.3)" className={`${styles.moneyCard} ${styles.dangerCard}`} role="article" aria-label={`Versement en échec pour ${p.eventName}, ${fmtXOF(p.amountDueXOF)}`}>
                <div className={styles.cardTop}>
                  <div className={styles.identity}>
                    <span className={`${styles.identityIcon} ${styles.dangerIcon}`} aria-hidden="true"><AlertTriangle size={18} /></span>
                    <div>
                      <strong>{p.eventName}</strong>
                      <span>{p.sellerName}{p.sellerEmail ? ` · ${p.sellerEmail}` : ''}</span>
                    </div>
                  </div>
                  <span className={`${styles.status} ${styles.statusDanger}`}>Échec</span>
                </div>
                <div className={styles.amountRow}><span>Montant à verser</span><strong>{fmtXOF(p.amountDueXOF)}</strong></div>
                {p.failReason && <div className={styles.note}><AlertTriangle size={15} aria-hidden="true" /><span><strong>Motif de l’échec : </strong>{p.failReason}</span></div>}
                {p.eventCancelled ? (
                  <div className={`${styles.note} ${styles.blockingNote}`} role="alert"><ShieldCheck size={16} aria-hidden="true" /><span><strong>Opération bloquée. </strong>Événement annulé : ne rien verser à l&apos;organisateur. La recette doit rembourser les acheteurs.</span></div>
                ) : (
                  <Button variant="primary" icon={<CheckCircle2 size={16} aria-hidden="true" />} className={styles.cardAction} aria-label={`Confirmer le versement de ${fmtXOF(p.amountDueXOF)} à ${p.sellerName}`} onClick={() => setConfirm({ type: 'markPayoutPaid', eventId: p.eventId, label: fmtXOF(p.amountDueXOF), who: p.sellerName })}>
                    Confirmer le versement
                  </Button>
                )}
              </Card>
            ))}
          </div>
          <Pagination page={failedPayoutsPage} pageCount={failedPayoutsPageCount} onPageChange={setFailedPayoutsPage} totalItems={failedPayouts.length} pageSize={PAGE_SIZE} />
        </div>
      )}

      {payoutRequests.length > 0 && (
        <div className={styles.queue}>
          <QueueHeader icon={<Landmark size={18} aria-hidden="true" />} title="Demandes de virement" description="Demandes EUR initiées par les organisateurs." count={payoutRequests.length} />
          <div className={styles.cardGrid}>
            {payoutRequestsPageItems.map((r) => (
              <PayoutCard key={r.requestId} sellerUid={r.sellerUid} sellerName={r.sellerName} sellerEmail={r.sellerEmail} amountDueCents={r.amountDueCents} amountDueXOF={r.amountDueXOF} payCents={r.payCents} requestId={r.requestId} requestedAt={r.requestedAt} mismatch={r.mismatch} setConfirm={setConfirm} />
            ))}
          </div>
          <Pagination page={payoutRequestsPage} pageCount={payoutRequestsPageCount} onPageChange={setPayoutRequestsPage} totalItems={payoutRequests.length} pageSize={PAGE_SIZE} />
        </div>
      )}

      {balancesNoReq.length > 0 && (
        <div className={styles.queue}>
          <QueueHeader icon={<Banknote size={18} aria-hidden="true" />} title="Soldes dus sans demande" description="Soldes disponibles qui n’ont pas encore fait l’objet d’une demande." count={balancesNoReq.length} tone="muted" />
          <div className={styles.cardGrid}>
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

function QueueHeader({ icon, title, description, count, tone = 'default' }: { icon: React.ReactNode; title: string; description: string; count: number; tone?: 'default' | 'danger' | 'muted' }) {
  return (
    <div className={styles.queueHeader}>
      <div className={`${styles.queueIcon} ${tone === 'danger' ? styles.queueIconDanger : ''}`} aria-hidden="true">{icon}</div>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <span aria-label={`${count} élément${count > 1 ? 's' : ''}`}>{count}</span>
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
    <Card accent={requestId ? 'rgba(245,201,106,0.3)' : undefined} className={styles.moneyCard} role="article" aria-label={`${requestId ? 'Demande de virement' : 'Solde disponible'} pour ${sellerName}`}>
      <div className={styles.cardTop}>
        <div className={styles.identity}>
          <span className={styles.identityIcon} aria-hidden="true"><UserRound size={18} /></span>
          <div>
            <strong>{sellerName}</strong>
            <span>{sellerEmail || sellerUid}</span>
          </div>
        </div>
        <span className={`${styles.status} ${requestId ? styles.statusPending : styles.statusNeutral}`}>{requestId ? 'Demandé' : 'Disponible'}</span>
      </div>

      {requestedAt && <div className={styles.dateLine}><Clock3 size={14} aria-hidden="true" /> Demandé le {new Date(requestedAt).toLocaleDateString('fr-FR')}</div>}
      <div className={styles.amounts}>
        {amountDueCents > 0 && <div><span>Solde EUR</span><strong>{fmtEUR(amountDueCents)}</strong></div>}
        {amountDueXOF > 0 && <div><span>Solde XOF</span><strong>{fmtXOF(amountDueXOF)}</strong></div>}
        {amountDueCents <= 0 && amountDueXOF <= 0 && <div><span>Solde disponible</span><strong>0</strong></div>}
      </div>

      {mismatch && <div className={styles.note} role="alert"><AlertTriangle size={15} aria-hidden="true" /><span><strong>Montant incohérent. </strong>La demande dépasse le solde réel. Seul le montant disponible sera réglé.</span></div>}

      {payCents > 0 && (
        <Button variant="primary" icon={<CheckCircle2 size={16} aria-hidden="true" />} className={styles.cardAction} aria-label={`Confirmer le versement de ${fmtEUR(payCents)} à ${sellerName}`} onClick={() => setConfirm({ type: 'settle', sellerUid, requestId, amount: payCents, currency: 'EUR', label: fmtEUR(payCents), who: sellerName })}>
          Confirmer {fmtEUR(payCents)} versés
        </Button>
      )}

      {amountDueXOF > 0 && (
        <div className={`${styles.note} ${styles.infoNote}`}><Smartphone size={15} aria-hidden="true" /><span>{fmtXOF(amountDueXOF)} sont destinés au versement automatique Mobile Money.</span></div>
      )}

      {requestId && payCents <= 0 && amountDueXOF <= 0 && (
        <Button variant="secondary" icon={<CheckCircle2 size={16} aria-hidden="true" />} className={styles.secondaryAction} aria-label={`Clore la demande à zéro de ${sellerName}`} onClick={() => setConfirm({ type: 'closeRequest', requestId, who: sellerName })}>
          Clore la demande à zéro
        </Button>
      )}
    </Card>
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
    <div className={styles.sectionStack}>
      <Card accent="rgba(109,215,200,0.3)" className={styles.guideCard} role="note">
        <div className={`${styles.guideIcon} ${styles.refundGuideIcon}`} aria-hidden="true"><RotateCcw size={20} /></div>
        <div><strong>Remboursements Mobile Money</strong><p>Exécutez d’abord le remboursement dans FedaPay, puis confirmez-le ici. Les paiements Stripe sont remboursés automatiquement.</p></div>
      </Card>
      {refunds.length === 0 ? (
        <EmptyState title="Aucun remboursement mobile money en attente" description="Les remboursements FedaPay à traiter manuellement apparaîtront ici." />
      ) : (
        <div className={styles.cardGrid}>
          {pageItems.map((r) => (
            <Card key={r.id} className={styles.moneyCard} role="article" aria-label={`Remboursement de ${fmtXOF(r.amountXOF)} pour ${r.eventName}`}>
              <div className={styles.cardTop}>
                <div className={styles.identity}>
                  <span className={`${styles.identityIcon} ${styles.refundIcon}`} aria-hidden="true"><ReceiptText size={18} /></span>
                  <div><strong>{r.eventName}</strong><span>{r.buyerEmail || 'Acheteur non renseigné'}</span></div>
                </div>
                <span className={`${styles.status} ${styles.statusRefund}`}>À rembourser</span>
              </div>
              <div className={styles.amountRow}><span>Montant à restituer</span><strong>{fmtXOF(r.amountXOF)}</strong></div>
              <div className={styles.metaGrid}>
                <div><ReceiptText size={14} aria-hidden="true" /><span><span className={styles.srOnly}>Référence FedaPay : </span>{r.paymentRef}</span></div>
                <div><Clock3 size={14} aria-hidden="true" /><span><span className={styles.srOnly}>Créé le : </span>{fmtDate(r.createdAt)}</span></div>
              </div>
              <Button variant="primary" icon={<CheckCircle2 size={16} aria-hidden="true" />} className={styles.refundAction} aria-label={`Confirmer le remboursement de ${fmtXOF(r.amountXOF)} à ${r.buyerEmail || 'cet acheteur'}`} onClick={() => setConfirm({ type: 'completeRefund', refundId: r.id, label: fmtXOF(r.amountXOF), who: r.buyerEmail || 'cet acheteur' })}>
                Confirmer le remboursement
              </Button>
            </Card>
          ))}
        </div>
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
    <div className={styles.sectionStack}>
      <Card accent="rgba(255,143,178,0.3)" className={styles.guideCard} role="note">
        <div className={`${styles.guideIcon} ${styles.alertGuideIcon}`} aria-hidden="true"><ShieldCheck size={20} /></div>
        <div><strong>Contrôle avant clôture</strong><p>Vérifiez la transaction dans Stripe ou FedaPay avant de rembourser, corriger ou clôturer une alerte.</p></div>
      </Card>
      {alerts.length === 0 ? (
        <EmptyState title="Aucune anomalie à traiter" description="Les paiements signalés comme anormaux apparaîtront ici." />
      ) : (
        <div className={styles.cardGrid}>
          {pageItems.map((a) => (
            <Card key={a.id} accent="rgba(255,143,178,0.32)" className={`${styles.moneyCard} ${styles.dangerCard}`} role="article" aria-label={`Alerte financière : ${ALERT_REASON_LABEL[a.reason] || a.reason}`}>
              <div className={styles.cardTop}>
                <div className={styles.identity}>
                  <span className={`${styles.identityIcon} ${styles.dangerIcon}`} aria-hidden="true"><AlertTriangle size={18} /></span>
                  <div><strong>{ALERT_REASON_LABEL[a.reason] || a.reason}</strong><span>{fmtDate(a.createdAt)}</span></div>
                </div>
                <span className={`${styles.status} ${styles.statusDanger}`}>À vérifier</span>
              </div>
              <div className={styles.alertContext}>
                {a.eventName && <p><strong>Événement</strong><span>{a.eventName}</span></p>}
                {a.sellerUid && <p><strong>Organisateur</strong><span>{a.sellerName || a.sellerUid}{a.sellerEmail ? ` · ${a.sellerEmail}` : ''}</span></p>}
                {Object.keys(a.details).length > 0 && <div className={styles.details}>
                  {Object.entries(a.details).map(([key, value]) => (
                    <p key={key}><strong>{humanizeDetailKey(key)}</strong><span>{fmtDetailValue(value)}</span></p>
                  ))}
                </div>}
              </div>
              <Button variant="primary" icon={<CheckCircle2 size={16} aria-hidden="true" />} className={styles.cardAction} aria-label={`Clôturer l’alerte après vérification : ${ALERT_REASON_LABEL[a.reason] || a.reason}`} onClick={() => setConfirm({ type: 'resolveAlert', alertId: a.id, label: ALERT_REASON_LABEL[a.reason] || a.reason })}>
                Clôturer après vérification
              </Button>
            </Card>
          ))}
        </div>
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
    <Modal onClose={onCancel} hideClose dismissible={!busy} ariaLabel={title}>
      <div className={styles.confirmIcon} aria-hidden="true"><ShieldCheck size={25} /></div>
      <h2 className={styles.confirmTitle}>{title}</h2>
      <p className={styles.confirmHelper}>{helper}</p>
      <div className={styles.confirmWarning} role="note"><AlertTriangle size={16} aria-hidden="true" /><span>Cette confirmation modifie le suivi financier de façon immédiate.</span></div>
      <div className={styles.confirmActions}>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
        <Button variant="primary" icon={<CheckCircle2 size={16} aria-hidden="true" />} onClick={onConfirm} disabled={busy} loading={busy} loadingText="Confirmation…" aria-label={title}>
          Confirmer
        </Button>
      </div>
    </Modal>
  )
}
