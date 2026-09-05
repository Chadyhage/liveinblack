'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Gauge, HelpCircle, RefreshCw, ServerCog, ShieldCheck, Sliders } from 'lucide-react'
import { Badge, Button, Card, DashboardPageHeader, Select, SkeletonCard, Tabs } from '@/app/components/ui'
import ConfirmDialog from '@/app/components/ui/ConfirmDialog'

type EventSource = 'all' | 'platform' | 'spend' | 'drain'

interface VercelOpsEvent {
  source: EventSource
  id: string
  type?: string | null
  teamId?: string | null
  projectId?: string | null
  deploymentId?: string | null
  requestId?: string | null
  region?: string | null
  eventCount?: number | null
  message?: string | null
  budgetAmount?: number | null
  currentSpend?: number | null
  thresholdPercent?: number | null
  autoMaintenanceTriggered?: boolean | null
  receivedAt?: string | Date
}

interface OpsConfig {
  maintenanceMode: boolean
  checkoutEnabled: boolean
  ticketResaleEnabled: boolean
  searchMinQueryLength: number
  publicCacheTtlSeconds: number
}

interface OpsConfigChange {
  id: string
  actorEmail?: string | null
  key: string
  previousValue?: boolean | number | string | null
  nextValue?: boolean | number | string | null
  changedAt?: string | Date
}

interface OpsStatus {
  edgeConfigWritable: boolean
  spendWebhookSecretConfigured: boolean
  spendAutoMaintenanceEnabled: boolean
  accountWebhookSecretConfigured: boolean
  drainSecretConfigured: boolean
  drainUrlConfigured: boolean
}

interface ProDecisionSummary {
  total: number
  finalised: number
  score: number
  remaining: Array<{
    key: string
    label: string
    status: 'active' | 'prepared' | 'planned' | 'rejected'
    nextAction: string
    proofCommand?: string
  }>
}

interface UsageWatchlistSummary {
  total: number
  cadence: string
  items: Array<{
    key: string
    label: string
    dashboard: string
    owner: string
    healthySignal: string
    actionIfBad: string
  }>
}

interface LiveActivationGatesSummary {
  total: number
  remaining: number
  closed: number
  gates: Array<{
    key: string
    label: string
    decisionKey: string
    status: string
    evidenceRequired: string
    safeNextAction: string
    riskIfForced: string
  }>
}

interface ActivationOrderSummary {
  total: number
  remaining: number
  closed: number
  steps: Array<{
    rank: number
    gateKey: string
    label: string
    owner: string
    automationLevel: string
    whyFirst: string
    preflight: string
    commandOrPlace: string
    doneWhen: string
  }>
}

interface CompletionEvidenceSummary {
  total: number
  complete: number
  score: number
  requirements: Array<{
    key: string
    label: string
    status: string
    evidenceSource: string
    evidenceRequired: string
    currentEvidence: string
    nextAction: string
    evidenceRecordCommand: string
  }>
}

interface AuditSuiteSummary {
  total: number
  local: number
  liveRead: number
  explicitApproval: number
  strictExpectedFailures: number
  commands: Array<{
    key: string
    label: string
    command: string
    scope: string
    requiredFor100: boolean
    requiresExplicitApproval?: boolean
    approvalReason?: string
    expectedBeforeLiveComplete: string
  }>
}

interface NextVercelActionSummary {
  open: boolean
  label: string
  completionScore: number
  followUpCommand: string
  proofCommand?: string
  dashboardHref?: string
  dashboardLabel?: string
  safetyLevel?: 'safe-prep' | 'manual-live' | 'explicit-approval'
  safetyMessage?: string
  preflightChecklist?: string[]
  step?: {
    rank: number
    gateKey: string
    label: string
    owner: string
    automationLevel: string
    whyFirst: string
    preflight: string
    commandOrPlace: string
    doneWhen: string
  }
  gate?: {
    key: string
    label: string
    decisionKey: string
    status: string
    evidenceRequired: string
    safeNextAction: string
    riskIfForced: string
  }
  decision?: {
    key: string
    label: string
    status: 'active' | 'prepared' | 'planned' | 'rejected'
    evidence: string
    nextAction: string
  }
}

interface ActionBlockerSummary {
  totalOpen: number
  automated: number
  manual: number
  explicitApproval: number
  topOwner: string
  ownerLoad: Array<{ owner: string; count: number }>
}

interface DashboardLinksSummary {
  teamId: string
  projectId: string
  links: Array<{
    key: string
    label: string
    href: string
    purpose: string
  }>
}

interface RiskCostSummary {
  open: number
  costControl: number
  securityControl: number
  observabilityExport: number
  liveMutation: number
  explicitApproval: number
  overallTone: 'teal' | 'gold' | 'danger' | 'neutral'
  verdict: string
  items: Array<{
    key: string
    label: string
    owner: string
    riskType: 'cost' | 'security' | 'observability' | 'architecture' | 'platform'
    severity: 'low' | 'medium' | 'high'
    reason: string
    nextAction: string
  }>
}

interface EvidenceFreshnessSummary {
  fresh: boolean
  oldestDays: number
  staleCount: number
  tone: 'teal' | 'gold' | 'danger' | 'neutral'
  verdict: string
  items: Array<{
    key: string
    label: string
    updatedAt: string
    ageDays: number
    stale: boolean
  }>
}

interface ProUtilizationModeSummary {
  mode: 'prepared' | 'live-proof-needed' | 'proved'
  tone: 'teal' | 'gold' | 'danger' | 'neutral'
  label: string
  summary: string
  nextActionLabel: string
  nextActionCommand: string
}

interface LiveActivationReadinessSummary {
  ready: boolean
  tone: 'teal' | 'gold' | 'danger' | 'neutral'
  label: string
  summary: string
  requiredBeforeAction: string[]
  nextSafeCommand: string
}

interface ProofDebtSummary {
  unavailable: boolean
  totalOpen: number
  remainingDecisions: number
  remainingGates: number
  missingRequirements: number
  tone: 'teal' | 'gold' | 'danger' | 'neutral'
  label: string
  summary: string
  items: Array<{
    key: string
    label: string
    source: 'decision' | 'live-gate' | 'strict-proof'
    status: string
    nextAction: string
    proofCommand?: string
  }>
}

interface NextProofCaptureSummary {
  open: boolean
  label: string
  source: 'dashboard' | 'live-audit' | 'explicit-approval' | 'implementation' | 'none'
  evidenceRequired: string
  dashboardHref?: string
  dashboardLabel?: string
  proofCommand: string
  guidance: string
}

interface LiveEvidenceMatrixSummary {
  total: number
  open: number
  liveRead: number
  manualDashboard: number
  explicitApproval: number
  items: Array<{
    key: string
    label: string
    source: 'dashboard' | 'live-audit' | 'explicit-approval' | 'implementation'
    status: string
    evidenceRequired: string
    proofCommand: string
    dashboardHref: string
    dashboardLabel: string
  }>
}

interface CompletionVerdictSummary {
  ready: boolean
  score: number
  tone: 'teal' | 'gold' | 'danger' | 'neutral'
  label: string
  verdict: string
  blockers: string[]
  requiredCommand: string
}

type ConfigPatch = Partial<OpsConfig>

interface PendingConfigChange {
  title: string
  body: string
  confirmLabel: string
  confirmVariant: 'primary' | 'danger'
  patch: ConfigPatch
  savingKey: string
}

const SOURCE_OPTIONS = [
  { value: 'all', label: 'Tous les flux' },
  { value: 'platform', label: 'Plateforme' },
  { value: 'spend', label: 'Budget' },
  { value: 'drain', label: 'Logs drain' },
]

const SOURCE_LABEL: Record<EventSource, string> = {
  all: 'Tous',
  platform: 'Plateforme',
  spend: 'Budget',
  drain: 'Drain',
}

function fmtDate(value: string | Date | undefined) {
  if (!value) return 'Date inconnue'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date inconnue'
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

function badgeTone(event: VercelOpsEvent) {
  if (event.source === 'spend' && (event.thresholdPercent ?? 0) >= 100) return 'danger'
  if (event.source === 'drain' && event.type === 'error') return 'danger'
  if (event.source === 'spend') return 'gold'
  if (event.source === 'platform') return 'teal'
  return 'neutral'
}

function shortId(value: string | null | undefined) {
  if (!value) return null
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-5)}` : value
}

export default function AgentVercelOpsClient() {
  const [events, setEvents] = useState<VercelOpsEvent[]>([])
  const [config, setConfig] = useState<OpsConfig | null>(null)
  const [opsStatus, setOpsStatus] = useState<OpsStatus | null>(null)
  const [proDecisions, setProDecisions] = useState<ProDecisionSummary | null>(null)
  const [usageWatchlist, setUsageWatchlist] = useState<UsageWatchlistSummary | null>(null)
  const [liveActivationGates, setLiveActivationGates] = useState<LiveActivationGatesSummary | null>(null)
  const [activationOrder, setActivationOrder] = useState<ActivationOrderSummary | null>(null)
  const [completionEvidence, setCompletionEvidence] = useState<CompletionEvidenceSummary | null>(null)
  const [auditSuite, setAuditSuite] = useState<AuditSuiteSummary | null>(null)
  const [nextAction, setNextAction] = useState<NextVercelActionSummary | null>(null)
  const [actionBlockers, setActionBlockers] = useState<ActionBlockerSummary | null>(null)
  const [dashboardLinks, setDashboardLinks] = useState<DashboardLinksSummary | null>(null)
  const [riskCost, setRiskCost] = useState<RiskCostSummary | null>(null)
  const [completionVerdict, setCompletionVerdict] = useState<CompletionVerdictSummary | null>(null)
  const [liveEvidenceMatrix, setLiveEvidenceMatrix] = useState<LiveEvidenceMatrixSummary | null>(null)
  const [nextProofCapture, setNextProofCapture] = useState<NextProofCaptureSummary | null>(null)
  const [proUtilizationMode, setProUtilizationMode] = useState<ProUtilizationModeSummary | null>(null)
  const [evidenceFreshness, setEvidenceFreshness] = useState<EvidenceFreshnessSummary | null>(null)
  const [liveActivationReadiness, setLiveActivationReadiness] = useState<LiveActivationReadinessSummary | null>(null)
  const [proofDebt, setProofDebt] = useState<ProofDebtSummary | null>(null)
  const [changes, setChanges] = useState<OpsConfigChange[]>([])
  const [configWritable, setConfigWritable] = useState(false)
  const [source, setSource] = useState<EventSource>('all')
  const [loading, setLoading] = useState(true)
  const [configLoading, setConfigLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [pendingConfigChange, setPendingConfigChange] = useState<PendingConfigChange | null>(null)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [configError, setConfigError] = useState(false)
  const [activeTab, setActiveTab] = useState<'controls' | 'status' | 'events' | 'advanced'>('controls')
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)

  const counts = useMemo(() => ({
    platform: events.filter((event) => event.source === 'platform').length,
    spend: events.filter((event) => event.source === 'spend').length,
    drain: events.filter((event) => event.source === 'drain').length,
    urgent: events.filter((event) => (event.source === 'spend' && (event.thresholdPercent ?? 0) >= 100) || (event.source === 'drain' && event.type === 'error')).length,
  }), [events])

  const readinessItems = useMemo(() => ([
    {
      label: 'Edge Config live',
      detail: config ? 'Flags lisibles par le site' : 'Flags pas encore chargés',
      done: Boolean(config),
    },
    {
      label: 'Pilotage agent',
      detail: configWritable ? 'Les agents peuvent changer les flags avec confirmation' : 'Lecture seule: écriture Vercel non configurée',
      done: configWritable,
    },
    {
      label: 'Webhook plateforme',
      detail: opsStatus?.accountWebhookSecretConfigured
        ? counts.platform > 0 ? `${counts.platform} signal(aux) reçus` : 'Secret configuré, en attente du prochain événement'
        : 'Secret webhook plateforme non configuré',
      done: Boolean(opsStatus?.accountWebhookSecretConfigured),
    },
    {
      label: 'Webhook budget',
      detail: opsStatus?.spendWebhookSecretConfigured
        ? opsStatus.spendAutoMaintenanceEnabled ? 'Secret configuré et auto-maintenance active' : 'Secret configuré, auto-maintenance manuelle'
        : 'Secret Spend Management non configuré',
      done: Boolean(opsStatus?.spendWebhookSecretConfigured),
    },
    {
      label: 'Log Drain',
      detail: opsStatus?.drainSecretConfigured
        ? counts.drain > 0 ? `${counts.drain} signal(aux) drain reçus` : 'Secret configuré, en attente du prochain log'
        : 'Drain non observé: activation live à approuver',
      done: Boolean(opsStatus?.drainSecretConfigured && (opsStatus.drainUrlConfigured || counts.drain > 0)),
    },
    {
      label: 'Réponse incident',
      detail: configWritable ? 'Mode urgence disponible sans redéploiement' : 'Mode urgence visible mais non modifiable',
      done: configWritable,
    },
  ]), [config, configWritable, counts, opsStatus])

  const readinessScore = Math.round((readinessItems.filter((item) => item.done).length / readinessItems.length) * 100)

  async function load(nextSource = source) {
    setLoading(true)
    setError(false)
    try {
      const params = new URLSearchParams({ limit: '60' })
      if (nextSource !== 'all') params.set('source', nextSource)
      const res = await fetch(`/api/agent/vercel/ops-events?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error('load_failed')
      setEvents(data.events ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  async function loadConfig() {
    setConfigLoading(true)
    setConfigError(false)
    try {
      const res = await fetch('/api/agent/vercel/ops-config', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error('config_load_failed')
      setConfig(data.config)
      setOpsStatus(data.opsStatus ?? null)
      setProDecisions(data.proDecisions ?? null)
      setUsageWatchlist(data.usageWatchlist ?? null)
      setLiveActivationGates(data.liveActivationGates ?? null)
      setActivationOrder(data.activationOrder ?? null)
      setCompletionEvidence(data.completionEvidence ?? null)
      setAuditSuite(data.auditSuite ?? null)
      setNextAction(data.nextAction ?? null)
      setActionBlockers(data.actionBlockers ?? null)
      setDashboardLinks(data.dashboardLinks ?? null)
      setRiskCost(data.riskCost ?? null)
      setCompletionVerdict(data.completionVerdict ?? null)
      setLiveEvidenceMatrix(data.liveEvidenceMatrix ?? null)
      setNextProofCapture(data.nextProofCapture ?? null)
      setProUtilizationMode(data.proUtilizationMode ?? null)
      setEvidenceFreshness(data.evidenceFreshness ?? null)
      setLiveActivationReadiness(data.liveActivationReadiness ?? null)
      setProofDebt(data.proofDebt ?? null)
      setConfigWritable(Boolean(data.writable))
      setChanges(data.changes ?? [])
    } catch {
      setConfigError(true)
    } finally {
      setConfigLoading(false)
    }
  }

  async function patchConfig(patch: ConfigPatch, nextSavingKey: string) {
    setSavingKey(nextSavingKey)
    setConfigError(false)
    try {
      const res = await fetch('/api/agent/vercel/ops-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error('config_save_failed')
      setConfig(data.config)
      setOpsStatus(data.opsStatus ?? null)
      setProDecisions(data.proDecisions ?? null)
      setUsageWatchlist(data.usageWatchlist ?? null)
      setLiveActivationGates(data.liveActivationGates ?? null)
      setActivationOrder(data.activationOrder ?? null)
      setCompletionEvidence(data.completionEvidence ?? null)
      setAuditSuite(data.auditSuite ?? null)
      setNextAction(data.nextAction ?? null)
      setActionBlockers(data.actionBlockers ?? null)
      setDashboardLinks(data.dashboardLinks ?? null)
      setRiskCost(data.riskCost ?? null)
      setCompletionVerdict(data.completionVerdict ?? null)
      setLiveEvidenceMatrix(data.liveEvidenceMatrix ?? null)
      setNextProofCapture(data.nextProofCapture ?? null)
      setProUtilizationMode(data.proUtilizationMode ?? null)
      setEvidenceFreshness(data.evidenceFreshness ?? null)
      setLiveActivationReadiness(data.liveActivationReadiness ?? null)
      setProofDebt(data.proofDebt ?? null)
      setConfigWritable(Boolean(data.writable))
      setChanges(data.changes ?? [])
    } catch {
      setConfigError(true)
    } finally {
      setSavingKey(null)
    }
  }

  function requestConfigPatch(change: PendingConfigChange) {
    setPendingConfigChange(change)
  }

  async function confirmConfigPatch() {
    if (!pendingConfigChange) return
    const change = pendingConfigChange
    await patchConfig(change.patch, change.savingKey)
    setPendingConfigChange(null)
  }

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(false)
      try {
        const res = await fetch('/api/agent/vercel/ops-events?limit=60', { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) setEvents(data.events ?? [])
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    // Chargement initial d'une ressource externe ; les mises à jour arrivent
    // après le fetch et `loadConfig` reste réutilisée par les actions UI.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConfig()
    return () => {
      cancelled = true
    }
  }, [])

  function onSourceChange(value: string) {
    const nextSource = (value === 'platform' || value === 'spend' || value === 'drain') ? value : 'all'
    setSource(nextSource)
    void load(nextSource)
  }

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command)
      setCopiedCommand(command)
      window.setTimeout(() => setCopiedCommand((current) => current === command ? null : current), 1400)
    } catch {
      setCopiedCommand(null)
    }
  }

  const siteStatusSummary = useMemo(() => {
    if (!config) return { tone: 'neutral' as const, label: 'Chargement...', desc: 'Récupération de la configuration du site...' }
    if (config.maintenanceMode) {
      return {
        tone: 'danger' as const,
        label: 'Mode Maintenance Actif',
        desc: 'Le site public est temporairement fermé aux visiteurs. Les fonctionnalités critiques sont suspendues.',
      }
    }
    if (!config.checkoutEnabled || !config.ticketResaleEnabled) {
      return {
        tone: 'gold' as const,
        label: 'Fonctionnement partiel',
        desc: `Le site est en ligne mais certaines options sont coupées (${!config.checkoutEnabled ? 'paiements désactivés' : ''}${!config.checkoutEnabled && !config.ticketResaleEnabled ? ', ' : ''}${!config.ticketResaleEnabled ? 'revente désactivée' : ''}).`,
      }
    }
    return {
      tone: 'teal' as const,
      label: 'Site 100% Opérationnel',
      desc: 'Tous les services fonctionnent normalement. Les visiteurs peuvent naviguer, acheter et revendre leurs billets.',
    }
  }, [config])

  return (
    <main className="lb-dashboard-page">
      <DashboardPageHeader
        eyebrow="Pilotage Opérationnel"
        title="Centre Vercel & Site"
        description="Gérez le site en direct (mode urgence, paiements, maintenance) et surveillez la santé globale en toute simplicité."
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {dashboardLinks?.links?.[0]?.href ? (
              <a
                href={dashboardLinks.links[0].href}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <Button variant="secondary" icon={<ExternalLink size={15} aria-hidden="true" />}>
                  Dashboard Vercel
                </Button>
              </a>
            ) : null}
            <Button variant="primary" onClick={() => load()} loading={loading} icon={<RefreshCw size={16} aria-hidden="true" />}>
              Actualiser
            </Button>
          </div>
        }
      />

      {/* ── BANDEAU RÉCAPITULATIF GRAND PUBLIC (Compréhensible en 2 secondes) ── */}
      <Card
        accent={siteStatusSummary.tone === 'danger' ? 'var(--danger)' : siteStatusSummary.tone === 'gold' ? 'var(--warning)' : 'var(--primary)'}
        style={{ marginBottom: 20 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-pill)',
                display: 'grid',
                placeItems: 'center',
                background: siteStatusSummary.tone === 'danger' ? 'rgba(239,68,68,0.15)' : siteStatusSummary.tone === 'gold' ? 'rgba(234,179,8,0.15)' : 'var(--primary-a14)',
                color: siteStatusSummary.tone === 'danger' ? 'var(--danger)' : siteStatusSummary.tone === 'gold' ? 'var(--warning)' : 'var(--primary)',
                flex: '0 0 auto',
              }}
            >
              {siteStatusSummary.tone === 'danger' ? <AlertTriangle size={24} /> : <CheckCircle2 size={24} />}
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-3)' }}>{siteStatusSummary.label}</h2>
                <Badge tone={siteStatusSummary.tone}>{configWritable ? 'Pilotable en direct' : 'Mode consultation'}</Badge>
              </div>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                {siteStatusSummary.desc}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Badge tone={counts.urgent > 0 ? 'danger' : 'teal'}>
              {counts.urgent > 0 ? `${counts.urgent} alerte(s) à vérifier` : 'Aucune alerte critique'}
            </Badge>
            <Badge tone="neutral">
              {readinessScore}% services configurés
            </Badge>
          </div>
        </div>
      </Card>

      {/* ── ONGLET DE NAVIGATION SIMPLIFIÉ ── */}
      <Tabs
        value={activeTab}
        onChange={(val) => setActiveTab(val as typeof activeTab)}
        options={[
          { value: 'controls', label: '🎛️ Commandes du Site' },
          { value: 'status', label: '📊 Santé & Budget' },
          { value: 'events', label: `🔔 Activité récente (${events.length})` },
          { value: 'advanced', label: '🛠️ Avancé & Audits' },
        ]}
        style={{ marginBottom: 20 }}
      />

      {/* ── ONGLET 1 : COMMANDES DU SITE (Le plus utile et simple) ── */}
      {activeTab === 'controls' ? (
        <div style={{ display: 'grid', gap: 18 }}>
          {/* Actions rapides d'urgence */}
          <Card>
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Actions rapides</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                Changez l’état du site en 1 clic en cas de problème ou pour revenir à la normale.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <QuickMode
                title="🟢 Tout rétablir (Mode normal)"
                description="Réouvre immédiatement la billetterie, les paiements et le site public."
                disabled={!configWritable || savingKey === 'preset-normal'}
                onClick={() => requestConfigPatch({
                  title: 'Repasser en mode normal ?',
                  body: 'Le site public reprend son fonctionnement standard : maintenance coupée, achats Stripe/FedaPay autorisés et bourse de revente réactivée.',
                  confirmLabel: 'Activer le mode normal',
                  confirmVariant: 'primary',
                  patch: { maintenanceMode: false, checkoutEnabled: true, ticketResaleEnabled: true },
                  savingKey: 'preset-normal',
                })}
              />

              <QuickMode
                title="🚨 Coupure d'urgence"
                description="Met immédiatement le site en pause et coupe les encaissements en cas de pépin."
                disabled={!configWritable || savingKey === 'preset-emergency'}
                danger
                onClick={() => requestConfigPatch({
                  title: 'Activer le mode urgence ?',
                  body: 'Cette action met le site en maintenance et suspend immédiatement tous les achats et la revente de billets. À utiliser en cas d’anomalie grave ou de maintenance programmée.',
                  confirmLabel: 'Activer l’urgence',
                  confirmVariant: 'danger',
                  patch: { maintenanceMode: true, checkoutEnabled: false, ticketResaleEnabled: false },
                  savingKey: 'preset-emergency',
                })}
              />
            </div>
          </Card>

          {/* Interrupteurs individuels */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Interrupteurs individuels</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                  Activez ou désactivez une fonction spécifique sans redéployer le site.
                </p>
              </div>
              <Badge tone={configWritable ? 'teal' : 'neutral'}>{configWritable ? 'Prêt à modifier' : 'Lecture seule'}</Badge>
            </div>

            {configError ? (
              <p style={{ color: 'var(--danger)', margin: '0 0 12px', fontWeight: 700 }}>Erreur de connexion aux paramètres en direct.</p>
            ) : null}

            {configLoading || !config ? (
              <SkeletonCard />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
                <FlagControl
                  label="Accès Public (Maintenance)"
                  description={config.maintenanceMode ? '⚠️ Le site affiche la page de maintenance' : '✅ Le site est accessible à tous'}
                  active={!config.maintenanceMode}
                  disabled={!configWritable || savingKey === 'maintenanceMode'}
                  onToggle={() => requestConfigPatch({
                    title: config.maintenanceMode ? 'Rouvrir le site public ?' : 'Mettre le site en maintenance ?',
                    body: config.maintenanceMode
                      ? 'Les visiteurs pourront de nouveau accéder aux pages et commander.'
                      : 'Les visiteurs verront un écran de maintenance et ne pourront plus effectuer d’action.',
                    confirmLabel: config.maintenanceMode ? 'Rouvrir le site' : 'Mettre en maintenance',
                    confirmVariant: config.maintenanceMode ? 'primary' : 'danger',
                    patch: { maintenanceMode: !config.maintenanceMode },
                    savingKey: 'maintenanceMode',
                  })}
                  danger={config.maintenanceMode}
                />

                <FlagControl
                  label="Paiements & Billetterie"
                  description={config.checkoutEnabled ? '✅ Les achats de billets sont ouverts' : '⛔ Les achats sont bloqués'}
                  active={config.checkoutEnabled}
                  disabled={!configWritable || savingKey === 'checkoutEnabled'}
                  onToggle={() => requestConfigPatch({
                    title: config.checkoutEnabled ? 'Suspendre les achats de billets ?' : 'Autoriser les achats de billets ?',
                    body: config.checkoutEnabled
                      ? 'Les paiements en ligne seront bloqués immédiatement.'
                      : 'Les visiteurs pourront de nouveau commander et payer leurs billets.',
                    confirmLabel: config.checkoutEnabled ? 'Bloquer les paiements' : 'Réactiver les paiements',
                    confirmVariant: config.checkoutEnabled ? 'danger' : 'primary',
                    patch: { checkoutEnabled: !config.checkoutEnabled },
                    savingKey: 'checkoutEnabled',
                  })}
                />

                <FlagControl
                  label="Bourse de revente officielle"
                  description={config.ticketResaleEnabled ? '✅ Les fans peuvent revendre leurs billets' : '⛔ La revente est suspendue'}
                  active={config.ticketResaleEnabled}
                  disabled={!configWritable || savingKey === 'ticketResaleEnabled'}
                  onToggle={() => requestConfigPatch({
                    title: config.ticketResaleEnabled ? 'Suspendre la revente de billets ?' : 'Autoriser la revente ?',
                    body: config.ticketResaleEnabled
                      ? 'La place de marché de revente entre particuliers sera inaccessible.'
                      : 'Les utilisateurs pourront à nouveau remettre des billets en vente.',
                    confirmLabel: config.ticketResaleEnabled ? 'Bloquer la revente' : 'Réactiver la revente',
                    confirmVariant: config.ticketResaleEnabled ? 'danger' : 'primary',
                    patch: { ticketResaleEnabled: !config.ticketResaleEnabled },
                    savingKey: 'ticketResaleEnabled',
                  })}
                />
              </div>
            )}
          </Card>

          {/* Raccourcis utiles */}
          {dashboardLinks?.links?.length ? (
            <Card>
              <h2 style={{ margin: '0 0 10px', fontSize: 'var(--font-size-title-4)' }}>Liens utiles Vercel</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                {dashboardLinks.links.map((link) => (
                  <a
                    key={link.key}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-lg)',
                      padding: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      color: 'var(--text)',
                      textDecoration: 'none',
                      background: 'var(--surface)',
                    }}
                  >
                    <div>
                      <strong style={{ display: 'block', fontSize: 'var(--font-size-body-sm)' }}>{link.label}</strong>
                      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-caption)' }}>{link.purpose}</span>
                    </div>
                    <ExternalLink size={14} color="var(--text-muted)" />
                  </a>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ── ONGLET 2 : SANTÉ & BUDGET (Métriques claires sans jargon) ── */}
      {activeTab === 'status' ? (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <Card accent="var(--primary-a35)">
              <Metric icon={<ServerCog size={20} />} label="Signaux Plateforme" value={counts.platform} />
            </Card>
            <Card accent="var(--primary-a35)">
              <Metric icon={<Gauge size={20} />} label="Alertes Budget" value={counts.spend} />
            </Card>
            <Card accent="var(--primary-a35)">
              <Metric icon={<Activity size={20} />} label="Journaux système (Logs)" value={counts.drain} />
            </Card>
            <Card accent={counts.urgent > 0 ? 'var(--danger)' : 'var(--primary-a35)'}>
              <Metric icon={<AlertTriangle size={20} />} label="Alertes urgentes" value={counts.urgent} />
            </Card>
          </div>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>État de connexion des services</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                  Aperçu de ce qui est branché entre le site et l'hébergeur Vercel.
                </p>
              </div>
              <Badge tone={readinessScore >= 80 ? 'teal' : 'gold'}>{readinessScore}% configuré</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {readinessItems.map((item) => (
                <ReadinessRow key={item.label} label={item.label} detail={item.detail} done={item.done} />
              ))}
            </div>
          </Card>

          {usageWatchlist && usageWatchlist.items.length > 0 ? (
            <Card>
              <div style={{ marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Indicateurs de consommation</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                  Que surveiller pour garantir des coûts maîtrisés et une vitesse maximale.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                {usageWatchlist.items.map((item) => (
                  <UsageRow key={item.key} label={item.label} dashboard={item.dashboard} owner={item.owner} actionIfBad={item.actionIfBad} />
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ── ONGLET 3 : ÉVÉNEMENTS & HISTORIQUE ── */}
      {activeTab === 'events' ? (
        <div style={{ display: 'grid', gap: 18 }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 200 }}>
                <Select value={source} onChange={onSourceChange} options={SOURCE_OPTIONS} aria-label="Filtrer par type d'événement" />
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                {events.length} événement(s) enregistré(s)
              </p>
            </div>
          </Card>

          {loading ? (
            <div className="lb-dashboard-card-grid">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : events.length === 0 ? (
            <Card>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0' }}>
                <ShieldCheck size={28} color="var(--primary)" aria-hidden="true" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Aucun événement récent</h3>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                    Tout est calme sur votre plateforme pour ce filtre.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {events.map((event) => (
                <Card key={`${event.source}-${event.id}`} accent={event.source === 'spend' && (event.thresholdPercent ?? 0) >= 100 ? 'var(--danger)' : undefined}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Badge tone={badgeTone(event)}>{SOURCE_LABEL[event.source]}</Badge>
                        <strong style={{ fontSize: 'var(--font-size-subhead)' }}>{event.type || event.message || 'Activité Vercel'}</strong>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-caption)' }}>
                        {event.message || 'Signal reçu de l’infrastructure'}
                      </p>
                      <div style={{ color: 'var(--text-faint)', fontSize: 'var(--font-size-caption)' }}>
                        Reçu le : {fmtDate(event.receivedAt)}
                      </div>
                    </div>
                    {event.autoMaintenanceTriggered ? <Badge tone="danger">Sécurité auto déclenchée</Badge> : null}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Historique des changements faits par l'équipe */}
          {changes.length > 0 ? (
            <Card>
              <h3 style={{ margin: '0 0 10px', fontSize: 'var(--font-size-title-5)' }}>Modifications récentes des paramètres</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {changes.map((change) => (
                  <div key={change.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                    <span><strong style={{ color: 'var(--text)' }}>{change.key}</strong> : {String(change.previousValue)} → {String(change.nextValue)}</span>
                    <span>{change.actorEmail || 'Admin'} · {fmtDate(change.changedAt)}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ── ONGLET 4 : AVANCÉ & AUDITS (Pour l'équipe technique / devops) ── */}
      {activeTab === 'advanced' ? (
        <div style={{ display: 'grid', gap: 18 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Sliders size={20} color="var(--primary)" />
              <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Réglages techniques & Cache</h2>
            </div>
            <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
              Ces réglages optimisent les requêtes et les performances du moteur de recherche d'événements.
            </p>

            {config ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
                <SelectControl
                  label="Longueur mini recherche"
                  value={String(config.searchMinQueryLength)}
                  disabled={!configWritable || savingKey === 'searchMinQueryLength'}
                  options={[1, 2, 3, 4, 5, 6, 7, 8].map((val) => ({ value: String(val), label: `${val} caractère${val > 1 ? 's' : ''}` }))}
                  onChange={(val) => patchConfig({ searchMinQueryLength: Number(val) }, 'searchMinQueryLength')}
                />
                <SelectControl
                  label="Durée du cache (secondes)"
                  value={String(config.publicCacheTtlSeconds)}
                  disabled={!configWritable || savingKey === 'publicCacheTtlSeconds'}
                  options={[15, 30, 45, 60, 120, 300].map((val) => ({ value: String(val), label: `${val}s` }))}
                  onChange={(val) => patchConfig({ publicCacheTtlSeconds: Number(val) }, 'publicCacheTtlSeconds')}
                />
              </div>
            ) : null}
          </Card>

          {/* Accompagnement technique / Commandes d'audit */}
          {nextAction ? <NextActionCard nextAction={nextAction} copiedCommand={copiedCommand} onCopyCommand={copyCommand} /> : null}
          {completionVerdict ? <CompletionVerdictCard verdict={completionVerdict} copiedCommand={copiedCommand} onCopyCommand={copyCommand} /> : null}

          {/* Détails techniques avancés sous accordéon */}
          <Card>
            <div
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
            >
              <div>
                <strong style={{ fontSize: 'var(--font-size-body)' }}>Audits poussés & Preuves de certification</strong>
                <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-caption)' }}>
                  Matrices de déploiement, audit CLI et analyse de risques complète.
                </p>
              </div>
              <Button variant="ghost" size="sm" icon={showTechnicalDetails ? <ChevronDown size={18} /> : <ChevronRight size={18} />}>
                {showTechnicalDetails ? 'Masquer' : 'Afficher'}
              </Button>
            </div>

            {showTechnicalDetails ? (
              <div style={{ display: 'grid', gap: 16, marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                {proUtilizationMode ? <ProUtilizationModeCard mode={proUtilizationMode} copiedCommand={copiedCommand} onCopyCommand={copyCommand} /> : null}
                {liveActivationReadiness ? <LiveActivationReadinessCard readiness={liveActivationReadiness} copiedCommand={copiedCommand} onCopyCommand={copyCommand} /> : null}
                {proofDebt ? <ProofDebtCard proofDebt={proofDebt} copiedCommand={copiedCommand} onCopyCommand={copyCommand} /> : null}
                {evidenceFreshness ? <EvidenceFreshnessCard freshness={evidenceFreshness} /> : null}
                {nextProofCapture ? <NextProofCaptureCard proof={nextProofCapture} copiedCommand={copiedCommand} onCopyCommand={copyCommand} /> : null}
                {liveEvidenceMatrix ? <LiveEvidenceMatrixCard matrix={liveEvidenceMatrix} copiedCommand={copiedCommand} onCopyCommand={copyCommand} /> : null}
                {actionBlockers ? <ActionBlockersCard actionBlockers={actionBlockers} /> : null}
                {riskCost ? <RiskCostCard riskCost={riskCost} /> : null}
                {auditSuite ? (
                  <div>
                    <h3 style={{ margin: '0 0 10px', fontSize: 'var(--font-size-title-5)' }}>Commandes d’audit CLI</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                      {auditSuite.commands.map((cmd) => (
                        <AuditCommandRow
                          key={cmd.key}
                          label={cmd.label}
                          command={cmd.command}
                          scope={cmd.scope}
                          requiresExplicitApproval={cmd.requiresExplicitApproval === true}
                          approvalReason={cmd.approvalReason}
                          expectedBeforeLiveComplete={cmd.expectedBeforeLiveComplete}
                          copiedCommand={copiedCommand}
                          onCopyCommand={copyCommand}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingConfigChange)}
        title={pendingConfigChange?.title ?? ''}
        body={pendingConfigChange?.body ?? ''}
        confirmLabel={pendingConfigChange?.confirmLabel}
        confirmVariant={pendingConfigChange?.confirmVariant}
        confirmLoading={Boolean(pendingConfigChange && savingKey === pendingConfigChange.savingKey)}
        confirmLoadingText="Mise à jour..."
        onCancel={() => setPendingConfigChange(null)}
        onConfirm={confirmConfigPatch}
      />
    </main>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <span style={{ width: 38, height: 38, borderRadius: 'var(--radius-pill)', display: 'grid', placeItems: 'center', background: 'var(--primary-a14)', color: 'var(--primary)' }}>
        {icon}
      </span>
      <div>
        <strong style={{ display: 'block', fontSize: 'var(--font-size-title-3)', lineHeight: 1 }}>{value}</strong>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>{label}</span>
      </div>
    </div>
  )
}

function EvidenceFreshnessCard({ freshness }: { freshness: EvidenceFreshnessSummary }) {
  return (
    <Card style={{ marginBottom: 18 }} accent={freshness.fresh ? 'var(--primary-a35)' : 'var(--warning)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Fraîcheur des preuves</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
            Les registres doivent rester récents pour que le 100% ne repose pas sur une vieille photo du compte.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone={freshness.tone}>{freshness.staleCount} obsolète(s)</Badge>
          <Badge tone="neutral">max {freshness.oldestDays}j</Badge>
        </div>
      </div>
      <p style={{ margin: '0 0 12px', color: freshness.fresh ? 'var(--primary)' : 'var(--text)', fontWeight: 700 }}>
        {freshness.verdict}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        {freshness.items.map((item) => (
          <div key={item.key} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, display: 'grid', gap: 6, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <strong>{item.label}</strong>
              <Badge tone={item.stale ? 'gold' : 'teal'}>{item.stale ? 'À relire' : 'Frais'}</Badge>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>{item.updatedAt} · {item.ageDays}j</span>
          </div>
        ))}
      </div>
    </Card>
  )
}


function ProofDebtCard({ proofDebt, copiedCommand, onCopyCommand }: { proofDebt: ProofDebtSummary; copiedCommand: string | null; onCopyCommand: (command: string) => void }) {
  const sourceLabel = { decision: 'Decision', 'live-gate': 'Porte live', 'strict-proof': 'Preuve stricte' } as const
  return (
    <Card style={{ marginBottom: 18 }} accent={proofDebt.tone === 'danger' ? 'var(--danger)' : proofDebt.tone === 'teal' ? 'var(--primary-a35)' : proofDebt.tone === 'gold' ? 'var(--warning)' : 'var(--border)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Dette de preuve 100%</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
            Ce qui reste a fermer avant de pouvoir dire que Vercel Pro est vraiment exploite a 100%.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone={proofDebt.tone}>{proofDebt.label}</Badge>
          {proofDebt.unavailable ? (
            <Badge tone="gold">registre a relire</Badge>
          ) : (
            <>
              <Badge tone="neutral">{proofDebt.remainingDecisions} decision(s)</Badge>
              <Badge tone="neutral">{proofDebt.remainingGates} porte(s)</Badge>
              <Badge tone="neutral">{proofDebt.missingRequirements} preuve(s)</Badge>
            </>
          )}
        </div>
      </div>
      <p style={{ margin: '0 0 12px', color: proofDebt.tone === 'danger' ? 'var(--danger)' : 'var(--text)', fontWeight: 700 }}>
        {proofDebt.summary}
      </p>
      {proofDebt.unavailable ? (
        <p style={{ margin: 0, color: 'var(--warning)', fontSize: 'var(--font-size-body-sm)', fontWeight: 700 }}>
          Les registres locaux doivent etre relus avant de conclure sur la dette de preuve.
        </p>
      ) : proofDebt.items.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>Aucune dette de preuve ouverte dans les registres locaux.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {proofDebt.items.slice(0, 8).map((item) => (
            <div key={`${item.source}-${item.key}`} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 10, display: 'grid', gap: 6, background: 'var(--surface-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <strong>{item.label}</strong>
                <Badge tone={item.source === 'live-gate' ? 'gold' : 'neutral'}>{sourceLabel[item.source]}</Badge>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>Statut: {item.status}</span>
              <span style={{ color: 'var(--text)', fontSize: 'var(--font-size-footnote-lg)' }}>Action: {item.nextAction}</span>
              {item.proofCommand ? <CommandLine label="Commande preuve" command={item.proofCommand} copied={copiedCommand === item.proofCommand} onCopy={onCopyCommand} muted /> : null}
            </div>
          ))}
          {proofDebt.items.length > 8 ? (
            <div style={{ border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', padding: 10, color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>
              +{proofDebt.items.length - 8} autre(s) dette(s) a fermer dans les registres.
            </div>
          ) : null}
        </div>
      )}
    </Card>
  )
}

function LiveActivationReadinessCard({ readiness, copiedCommand, onCopyCommand }: { readiness: LiveActivationReadinessSummary; copiedCommand: string | null; onCopyCommand: (command: string) => void }) {
  return (
    <Card style={{ marginBottom: 18 }} accent={readiness.tone === 'danger' ? 'var(--danger)' : readiness.tone === 'teal' ? 'var(--primary-a35)' : readiness.tone === 'gold' ? 'var(--warning)' : 'var(--border)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Feu vert activation live</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
            Decision simple avant de toucher au dashboard Vercel Pro: continuer, revoir, ou attendre un accord humain.
          </p>
        </div>
        <Badge tone={readiness.tone}>{readiness.ready ? 'pret' : 'pause controlee'}</Badge>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 12, background: 'var(--surface-subtle)' }}>
          <strong style={{ display: 'block', marginBottom: 4 }}>{readiness.label}</strong>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>{readiness.summary}</p>
        </div>
        {readiness.requiredBeforeAction.length > 0 ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {readiness.requiredBeforeAction.map((item) => (
              <div key={item} style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>- {item}</div>
            ))}
          </div>
        ) : null}
        <CommandLine label="Commande sure maintenant" command={readiness.nextSafeCommand} copied={copiedCommand === readiness.nextSafeCommand} onCopy={onCopyCommand} />
      </div>
    </Card>
  )
}

function ProUtilizationModeCard({
  mode,
  copiedCommand,
  onCopyCommand,
}: {
  mode: ProUtilizationModeSummary
  copiedCommand: string | null
  onCopyCommand: (command: string) => void
}) {
  return (
    <Card style={{ marginBottom: 18 }} accent={mode.tone === 'danger' ? 'var(--danger)' : mode.tone === 'gold' ? 'var(--warning)' : 'var(--primary-a35)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Mode d’exploitation Vercel Pro</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
            La lecture la plus courte pour savoir si le compte est seulement prêt, à prouver, ou vraiment à 100%.
          </p>
        </div>
        <Badge tone={mode.tone}>{mode.label}</Badge>
      </div>
      <p style={{ margin: '0 0 12px', color: mode.tone === 'danger' ? 'var(--danger)' : 'var(--text)', fontWeight: 700 }}>
        {mode.summary}
      </p>
      <span style={{ display: 'block', marginBottom: 10, color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>
        Prochaine action: {mode.nextActionLabel}
      </span>
      <CommandLine label="Commande associée" command={mode.nextActionCommand} copied={copiedCommand === mode.nextActionCommand} onCopy={onCopyCommand} muted />
    </Card>
  )
}


function CompletionVerdictCard({
  verdict,
  copiedCommand,
  onCopyCommand,
}: {
  verdict: CompletionVerdictSummary
  copiedCommand: string | null
  onCopyCommand: (command: string) => void
}) {
  return (
    <Card style={{ marginBottom: 18 }} accent={verdict.ready ? 'var(--primary-a35)' : verdict.tone === 'danger' ? 'var(--danger)' : 'var(--warning)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Verdict 100% Vercel Pro</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
            Le garde-fou qui empêche de déclarer “100% utilisé” tant que le live n’est pas prouvé.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone={verdict.tone}>{verdict.label}</Badge>
          <Badge tone="neutral">{verdict.score}%</Badge>
        </div>
      </div>
      <p style={{ margin: '0 0 12px', color: verdict.ready ? 'var(--primary)' : 'var(--text)', fontWeight: 700 }}>
        {verdict.verdict}
      </p>
      {verdict.blockers.length > 0 ? (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {verdict.blockers.map((blocker) => (
            <div key={blocker} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 10, color: 'var(--text-muted)', background: 'var(--surface-subtle)', fontSize: 'var(--font-size-footnote-lg)' }}>
              {blocker}
            </div>
          ))}
        </div>
      ) : null}
      <CommandLine label="Audit final requis" command={verdict.requiredCommand} copied={copiedCommand === verdict.requiredCommand} onCopy={onCopyCommand} muted />
    </Card>
  )
}


function NextActionCard({
  nextAction,
  copiedCommand,
  onCopyCommand,
}: {
  nextAction: NextVercelActionSummary
  copiedCommand: string | null
  onCopyCommand: (command: string) => void
}) {
  const step = nextAction.step
  const gate = nextAction.gate
  const decision = nextAction.decision
  const tone = !nextAction.open ? 'teal' : step?.automationLevel === 'requires-explicit-approval' ? 'danger' : step?.automationLevel.includes('manual') ? 'gold' : 'neutral'
  const badge = !nextAction.open
    ? 'À vérifier'
    : step?.automationLevel === 'requires-explicit-approval'
      ? 'Accord requis'
      : step?.automationLevel.includes('manual')
        ? 'Action humaine'
        : 'Automatisable'
  const safetyTone = nextAction.safetyLevel === 'explicit-approval' ? 'danger' : nextAction.safetyLevel === 'manual-live' ? 'gold' : 'teal'

  return (
    <Card style={{ marginBottom: 18 }} accent={nextAction.open ? 'var(--primary)' : 'var(--primary-a35)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Prochaine action recommandée</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
            Le prochain geste concret pour rapprocher Vercel Pro du 100% prouvé.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone={tone}>{badge}</Badge>
          {nextAction.safetyLevel ? <Badge tone={safetyTone}>{nextAction.safetyLevel === 'safe-prep' ? 'Préparation safe' : nextAction.safetyLevel === 'manual-live' ? 'Live manuel' : 'Feu vert requis'}</Badge> : null}
          <Badge tone="neutral">{nextAction.completionScore}% preuves</Badge>
        </div>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14, display: 'grid', gap: 10, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ display: 'block', fontSize: 'var(--font-size-title-5)' }}>{nextAction.label}</strong>
            {decision ? (
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>
                Décision liée: {decision.label} · {decision.status}
              </span>
            ) : null}
          </div>
          {step ? <Badge tone="neutral">Étape {step.rank}</Badge> : null}
        </div>
        {step ? (
          <>
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>Pourquoi maintenant: {step.whyFirst}</span>
            <span style={{ color: 'var(--text)', fontSize: 'var(--font-size-footnote-lg)' }}>Avant de lancer: {step.preflight}</span>
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--font-size-footnote-lg)' }}>Action: {step.commandOrPlace}</span>
            <span style={{ color: 'var(--primary)', fontSize: 'var(--font-size-footnote-lg)' }}>Terminé quand: {step.doneWhen}</span>
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>
            Toutes les étapes ordonnées semblent fermées. La suite consiste à relancer l’audit strict avec lecture live.
          </span>
        )}
        {gate ? (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 6 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>Preuve attendue: {gate.evidenceRequired}</span>
            <span style={{ color: 'var(--danger)', fontSize: 'var(--font-size-footnote-lg)' }}>Risque si forcé: {gate.riskIfForced}</span>
          </div>
        ) : null}
        {nextAction.safetyMessage ? (
          <span style={{ color: nextAction.safetyLevel === 'explicit-approval' ? 'var(--danger)' : 'var(--text)', fontSize: 'var(--font-size-footnote-lg)', fontWeight: 700 }}>
            Sécurité: {nextAction.safetyMessage}
          </span>
        ) : null}
        {nextAction.preflightChecklist && nextAction.preflightChecklist.length > 0 ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 10, display: 'grid', gap: 8, background: 'var(--surface-subtle)' }}>
            <strong style={{ fontSize: 'var(--font-size-footnote-lg)' }}>Checklist avant action</strong>
            <div style={{ display: 'grid', gap: 8 }}>
              {nextAction.preflightChecklist.map((item, index) => (
                <div key={`${item}-${index}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>
                  <span style={{ width: 22, height: 22, borderRadius: 'var(--radius-pill)', display: 'grid', placeItems: 'center', flex: '0 0 auto', background: 'var(--primary-a14)', color: 'var(--primary)', fontWeight: 800 }}>
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {nextAction.dashboardHref ? (
          <a
            href={nextAction.dashboardHref}
            target="_blank"
            rel="noreferrer"
            style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 10, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', color: 'var(--text)', textDecoration: 'none', background: 'var(--surface-subtle)' }}
          >
            <span>{nextAction.dashboardLabel || 'Ouvrir Vercel'}</span>
            <Badge tone="neutral">Dashboard</Badge>
          </a>
        ) : null}
        {nextAction.proofCommand ? (
          <CommandLine label="Commande preuve" command={nextAction.proofCommand} copied={copiedCommand === nextAction.proofCommand} onCopy={onCopyCommand} />
        ) : null}
        <CommandLine label="Diagnostic" command={nextAction.followUpCommand} copied={copiedCommand === nextAction.followUpCommand} onCopy={onCopyCommand} muted />
      </div>
    </Card>
  )
}

function CommandLine({
  label,
  command,
  copied,
  muted,
  onCopy,
}: {
  label: string
  command: string
  copied: boolean
  muted?: boolean
  onCopy: (command: string) => void
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 10, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: muted ? 'var(--surface-subtle)' : 'var(--primary-a08)' }}>
      <span style={{ minWidth: 0, flex: 1, color: muted ? 'var(--text)' : 'var(--primary)', fontSize: 'var(--font-size-footnote-lg)', fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>
        {label}: {command}
      </span>
      <Button variant="secondary" size="sm" onClick={() => onCopy(command)}>
        {copied ? 'Copié' : 'Copier'}
      </Button>
    </div>
  )
}

function NextProofCaptureCard({
  proof,
  copiedCommand,
  onCopyCommand,
}: {
  proof: NextProofCaptureSummary
  copiedCommand: string | null
  onCopyCommand: (command: string) => void
}) {
  const tone = proof.source === 'explicit-approval' ? 'danger' : proof.open ? 'gold' : 'teal'
  const sourceLabel = proof.source === 'dashboard'
    ? 'Preuve dashboard'
    : proof.source === 'live-audit'
      ? 'Preuve audit live'
      : proof.source === 'explicit-approval'
        ? 'Accord explicite'
        : proof.source === 'implementation'
          ? 'Preuve implementation'
          : 'Audit final'
  return (
    <Card style={{ marginBottom: 18 }} accent={proof.open ? 'var(--warning)' : 'var(--primary-a35)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Prochaine preuve à capturer</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
            Le prochain élément concret à prouver pour transformer le préparé en 100% live.
          </p>
        </div>
        <Badge tone={tone}>{sourceLabel}</Badge>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, display: 'grid', gap: 8, background: 'var(--surface)' }}>
        <strong>{proof.label}</strong>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>Preuve attendue: {proof.evidenceRequired}</span>
        <span style={{ color: 'var(--text)', fontSize: 'var(--font-size-footnote-lg)' }}>{proof.guidance}</span>
        {proof.dashboardHref ? (
          <a href={proof.dashboardHref} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: 'var(--font-size-footnote-lg)', fontWeight: 700 }}>
            {proof.dashboardLabel || 'Ouvrir Vercel'}
          </a>
        ) : null}
        <CommandLine label={proof.open ? 'Commande preuve' : 'Audit final'} command={proof.proofCommand} copied={copiedCommand === proof.proofCommand} onCopy={onCopyCommand} />
      </div>
    </Card>
  )
}


function LiveEvidenceMatrixCard({
  matrix,
  copiedCommand,
  onCopyCommand,
}: {
  matrix: LiveEvidenceMatrixSummary
  copiedCommand: string | null
  onCopyCommand: (command: string) => void
}) {
  return (
    <Card style={{ marginBottom: 18 }} accent={matrix.explicitApproval > 0 ? 'var(--danger)' : matrix.open > 0 ? 'var(--warning)' : 'var(--primary-a35)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Matrice des preuves live</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
            Chaque porte restante indique où trouver la preuve et quelle commande utiliser après confirmation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone={matrix.open > 0 ? 'gold' : 'teal'}>{matrix.open}/{matrix.total} ouverte(s)</Badge>
          {matrix.explicitApproval > 0 ? <Badge tone="danger">{matrix.explicitApproval} accord</Badge> : null}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: matrix.items.length > 0 ? 12 : 0 }}>
        <BlockerMetric label="Audit live" value={matrix.liveRead} tone="teal" />
        <BlockerMetric label="Dashboard" value={matrix.manualDashboard} tone={matrix.manualDashboard > 0 ? 'gold' : 'neutral'} />
        <BlockerMetric label="Accord explicite" value={matrix.explicitApproval} tone={matrix.explicitApproval > 0 ? 'danger' : 'neutral'} />
      </div>
      {matrix.items.length > 0 ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {matrix.items.map((item) => (
            <LiveEvidenceRow key={item.key} item={item} copiedCommand={copiedCommand} onCopyCommand={onCopyCommand} />
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>Toutes les portes live sont fermées ou rejetées.</p>
      )}
    </Card>
  )
}

function LiveEvidenceRow({
  item,
  copiedCommand,
  onCopyCommand,
}: {
  item: LiveEvidenceMatrixSummary['items'][number]
  copiedCommand: string | null
  onCopyCommand: (command: string) => void
}) {
  const sourceTone = item.source === 'explicit-approval' ? 'danger' : item.source === 'dashboard' ? 'gold' : 'teal'
  const sourceLabel = item.source === 'explicit-approval'
    ? 'Accord explicite'
    : item.source === 'dashboard'
      ? 'Dashboard'
      : item.source === 'implementation'
        ? 'Implémentation'
        : 'Audit live'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, display: 'grid', gap: 8, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <strong>{item.label}</strong>
        <Badge tone={sourceTone}>{sourceLabel}</Badge>
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>Preuve attendue: {item.evidenceRequired}</span>
      <a href={item.dashboardHref} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: 'var(--font-size-footnote-lg)', fontWeight: 700 }}>
        {item.dashboardLabel}
      </a>
      <CommandLine label="Commande preuve" command={item.proofCommand} copied={copiedCommand === item.proofCommand} onCopy={onCopyCommand} />
    </div>
  )
}


function ActionBlockersCard({ actionBlockers }: { actionBlockers: ActionBlockerSummary }) {
  return (
    <Card style={{ marginBottom: 18 }} accent={actionBlockers.explicitApproval > 0 ? 'var(--danger)' : actionBlockers.manual > 0 ? 'var(--warning)' : 'var(--primary-a35)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Blocages vers 100%</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
            Lecture rapide de ce qui empêche encore Vercel Pro d’être pleinement exploité.
          </p>
        </div>
        <Badge tone={actionBlockers.totalOpen > 0 ? 'gold' : 'teal'}>{actionBlockers.totalOpen} action(s) ouverte(s)</Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <BlockerMetric label="Automatisables" value={actionBlockers.automated} tone="teal" />
        <BlockerMetric label="Humaines" value={actionBlockers.manual} tone="gold" />
        <BlockerMetric label="Accord explicite" value={actionBlockers.explicitApproval} tone={actionBlockers.explicitApproval > 0 ? 'danger' : 'neutral'} />
        <BlockerMetric label="Responsable principal" value={actionBlockers.topOwner} tone="neutral" />
      </div>
      {actionBlockers.ownerLoad.length > 0 ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {actionBlockers.ownerLoad.map((item) => (
            <Badge key={item.owner} tone="neutral">{item.owner}: {item.count}</Badge>
          ))}
        </div>
      ) : null}
    </Card>
  )
}

function BlockerMetric({ label, value, tone }: { label: string; value: number | string; tone: 'teal' | 'gold' | 'danger' | 'neutral' }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, display: 'grid', gap: 6 }}>
      <Badge tone={tone}>{label}</Badge>
      <strong style={{ fontSize: 'var(--font-size-title-4)' }}>{value}</strong>
    </div>
  )
}

function RiskCostCard({ riskCost }: { riskCost: RiskCostSummary }) {
  return (
    <Card style={{ marginBottom: 18 }} accent={riskCost.overallTone === 'danger' ? 'var(--danger)' : riskCost.overallTone === 'gold' ? 'var(--warning)' : 'var(--primary-a35)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Risque et coût restants</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
            Ce qui peut coûter cher, bloquer le live ou exporter des données avant le 100% Vercel Pro.
          </p>
        </div>
        <Badge tone={riskCost.overallTone}>{riskCost.open} risque(s) ouvert(s)</Badge>
      </div>
      <p style={{ margin: '0 0 12px', color: riskCost.overallTone === 'danger' ? 'var(--danger)' : 'var(--text)', fontWeight: 700 }}>
        {riskCost.verdict}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: riskCost.items.length > 0 ? 12 : 0 }}>
        <BlockerMetric label="Coût" value={riskCost.costControl} tone={riskCost.costControl > 0 ? 'gold' : 'neutral'} />
        <BlockerMetric label="Sécurité" value={riskCost.securityControl} tone={riskCost.securityControl > 0 ? 'danger' : 'neutral'} />
        <BlockerMetric label="Export logs" value={riskCost.observabilityExport} tone={riskCost.observabilityExport > 0 ? 'danger' : 'neutral'} />
        <BlockerMetric label="Live manuel" value={riskCost.liveMutation} tone={riskCost.liveMutation > 0 ? 'gold' : 'teal'} />
      </div>
      {riskCost.items.length > 0 ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {riskCost.items.map((item) => (
            <RiskCostRow key={item.key} item={item} />
          ))}
        </div>
      ) : null}
    </Card>
  )
}

function RiskCostRow({ item }: { item: RiskCostSummary['items'][number] }) {
  const severityTone = item.severity === 'high' ? 'danger' : item.severity === 'medium' ? 'gold' : 'teal'
  const typeLabel = item.riskType === 'cost'
    ? 'Coût'
    : item.riskType === 'security'
      ? 'Sécurité'
      : item.riskType === 'observability'
        ? 'Observabilité'
        : item.riskType === 'architecture'
          ? 'Architecture'
          : 'Plateforme'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, display: 'grid', gap: 8, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <strong>{item.label}</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone="neutral">{typeLabel}</Badge>
          <Badge tone={severityTone}>{item.severity === 'high' ? 'Risque fort' : item.severity === 'medium' ? 'Risque moyen' : 'Risque bas'}</Badge>
        </div>
      </div>
      <span style={{ color: 'var(--text-faint)', fontSize: 'var(--font-size-footnote-lg)' }}>Responsable: {item.owner}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>Pourquoi c’est sensible: {item.reason}</span>
      <span style={{ color: 'var(--primary)', fontSize: 'var(--font-size-footnote-lg)' }}>Action sûre: {item.nextAction}</span>
    </div>
  )
}

function DashboardLinksCard({ dashboardLinks }: { dashboardLinks: DashboardLinksSummary }) {
  return (
    <Card style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Accès dashboard Vercel</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
            Les raccourcis utiles pour fermer les portes live sans chercher dans Vercel.
          </p>
        </div>
        {dashboardLinks.teamId ? <Badge tone="neutral">{shortId(dashboardLinks.teamId)}</Badge> : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
        {dashboardLinks.links.map((link) => (
          <a
            key={link.key}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, display: 'grid', gap: 6, color: 'var(--text)', textDecoration: 'none', background: 'var(--surface)' }}
          >
            <strong>{link.label}</strong>
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>{link.purpose}</span>
          </a>
        ))}
      </div>
    </Card>
  )
}

function ReadinessRow({ label, detail, done }: { label: string; detail: string; done: boolean }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ width: 10, height: 10, borderRadius: 'var(--radius-pill)', background: done ? 'var(--primary)' : 'var(--warning)', marginTop: 5, flex: '0 0 auto' }} />
      <div>
        <strong style={{ display: 'block' }}>{label}</strong>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>{detail}</span>
      </div>
    </div>
  )
}

function DecisionRow({ label, status, nextAction }: { label: string; status: string; nextAction: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 220, flex: 1 }}>
        <strong style={{ display: 'block' }}>{label}</strong>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>{nextAction}</span>
      </div>
      <Badge tone={status === 'planned' ? 'gold' : 'neutral'}>{status === 'prepared' ? 'Prêt' : status === 'planned' ? 'Planifié' : status}</Badge>
    </div>
  )
}

function UsageRow({ label, dashboard, owner, actionIfBad }: { label: string; dashboard: string; owner: string; actionIfBad: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <strong>{label}</strong>
        <Badge tone="neutral">{owner}</Badge>
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>{dashboard}</span>
      <span style={{ color: 'var(--text-faint)', fontSize: 'var(--font-size-footnote-lg)' }}>{actionIfBad}</span>
    </div>
  )
}

function LiveGateRow({
  label,
  status,
  evidenceRequired,
  safeNextAction,
  riskIfForced,
}: {
  label: string
  status: string
  evidenceRequired: string
  safeNextAction: string
  riskIfForced: string
}) {
  const tone = status === 'requires-explicit-approval' ? 'danger' : status.includes('manual') ? 'gold' : 'neutral'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <strong>{label}</strong>
        <Badge tone={tone}>{status === 'requires-explicit-approval' ? 'Accord requis' : status.includes('manual') ? 'Action humaine' : 'Action préparée'}</Badge>
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>Preuve attendue: {evidenceRequired}</span>
      <span style={{ color: 'var(--text)', fontSize: 'var(--font-size-footnote-lg)' }}>Prochaine action: {safeNextAction}</span>
      <span style={{ color: 'var(--danger)', fontSize: 'var(--font-size-footnote-lg)' }}>Risque si forcé: {riskIfForced}</span>
    </div>
  )
}

function ActivationStepRow({
  rank,
  label,
  owner,
  automationLevel,
  whyFirst,
  preflight,
  commandOrPlace,
  doneWhen,
}: {
  rank: number
  label: string
  owner: string
  automationLevel: string
  whyFirst: string
  preflight: string
  commandOrPlace: string
  doneWhen: string
}) {
  const tone = automationLevel === 'requires-explicit-approval' ? 'danger' : automationLevel.includes('manual') ? 'gold' : 'teal'
  const automationLabel = automationLevel === 'requires-explicit-approval'
    ? 'Accord explicite'
    : automationLevel.includes('manual')
      ? 'Manuel'
      : 'Automatisable'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ width: 28, height: 28, borderRadius: 'var(--radius-pill)', display: 'grid', placeItems: 'center', background: 'var(--primary-a14)', color: 'var(--primary)', fontWeight: 800 }}>
            {rank}
          </span>
          <strong>{label}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone="neutral">{owner}</Badge>
          <Badge tone={tone}>{automationLabel}</Badge>
        </div>
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>Pourquoi maintenant: {whyFirst}</span>
      <span style={{ color: 'var(--text)', fontSize: 'var(--font-size-footnote-lg)' }}>Avant: {preflight}</span>
      <span style={{ color: 'var(--text-faint)', fontSize: 'var(--font-size-footnote-lg)' }}>Action: {commandOrPlace}</span>
      <span style={{ color: 'var(--primary)', fontSize: 'var(--font-size-footnote-lg)' }}>Terminé quand: {doneWhen}</span>
    </div>
  )
}

function CompletionRequirementRow({
  label,
  status,
  evidenceSource,
  evidenceRequired,
  currentEvidence,
  nextAction,
  evidenceRecordCommand,
  copiedCommand,
  onCopyCommand,
}: {
  label: string
  status: string
  evidenceSource: string
  evidenceRequired: string
  currentEvidence: string
  nextAction: string
  evidenceRecordCommand: string
  copiedCommand: string | null
  onCopyCommand: (command: string) => void
}) {
  const isComplete = status === 'complete'
  const tone = isComplete ? 'teal' : status === 'prepared' ? 'neutral' : 'gold'
  const labelText = isComplete ? 'Prouvé' : status === 'prepared' ? 'Préparé' : 'Preuve live attendue'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <strong>{label}</strong>
        <Badge tone={tone}>{labelText}</Badge>
      </div>
      <span style={{ color: 'var(--text-faint)', fontSize: 'var(--font-size-footnote-lg)' }}>Source: {evidenceSource}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>Preuve requise: {evidenceRequired}</span>
      <span style={{ color: isComplete ? 'var(--primary)' : 'var(--warning)', fontSize: 'var(--font-size-footnote-lg)' }}>Preuve actuelle: {currentEvidence}</span>
      <span style={{ color: 'var(--text)', fontSize: 'var(--font-size-footnote-lg)' }}>Prochaine action: {nextAction}</span>
      <CommandLine label="Commande preuve" command={evidenceRecordCommand} copied={copiedCommand === evidenceRecordCommand} onCopy={onCopyCommand} />
    </div>
  )
}

function AuditCommandRow({
  label,
  command,
  scope,
  requiresExplicitApproval,
  approvalReason,
  expectedBeforeLiveComplete,
  copiedCommand,
  onCopyCommand,
}: {
  label: string
  command: string
  scope: string
  requiresExplicitApproval?: boolean
  approvalReason?: string
  expectedBeforeLiveComplete: string
  copiedCommand: string | null
  onCopyCommand: (command: string) => void
}) {
  const tone = scope === 'live-read' ? 'gold' : expectedBeforeLiveComplete === 'fail-until-live-proof' ? 'danger' : 'neutral'
  const scopeLabel = scope === 'live-read'
    ? 'Lecture live'
    : expectedBeforeLiveComplete === 'fail-until-live-proof'
      ? 'Strict'
      : 'Local'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <strong>{label}</strong>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Badge tone={tone}>{scopeLabel}</Badge>
          {requiresExplicitApproval ? <Badge tone="danger">Approbation requise</Badge> : null}
        </div>
      </div>
      <CommandLine label="Commande" command={command} copied={copiedCommand === command} onCopy={onCopyCommand} muted />
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>
        {requiresExplicitApproval
          ? approvalReason || 'Levier sensible: a lancer seulement apres validation humaine explicite.'
          : expectedBeforeLiveComplete === 'fail-until-live-proof'
          ? 'Peut echouer tant que les preuves live manquent.'
          : scope === 'live-read'
            ? 'Lit Vercel: a lancer quand on veut verifier le vrai etat du compte.'
            : 'Audit local sans mutation Vercel.'}
      </span>
    </div>
  )
}

function QuickMode({ title, description, disabled, danger, onClick }: { title: string; description: string; disabled: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <div style={{ border: `1px solid ${danger ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: danger ? 'rgba(185, 28, 28, 0.06)' : 'var(--surface)' }}>
      <div style={{ minWidth: 170, flex: 1 }}>
        <strong>{title}</strong>
        <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>{description}</p>
      </div>
      <Button variant={danger ? 'danger' : 'primary'} size="sm" disabled={disabled} onClick={onClick}>
        Appliquer
      </Button>
    </div>
  )
}

function FlagControl({ label, description, active, disabled, onToggle, danger }: { label: string; description: string; active: boolean; disabled: boolean; onToggle: () => void; danger?: boolean }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14, display: 'grid', gap: 10 }}>
      <div>
        <strong>{label}</strong>
        <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>{description}</p>
      </div>
      <Button variant={danger ? 'danger' : active ? 'primary' : 'secondary'} size="sm" disabled={disabled} onClick={onToggle}>
        {active ? 'Activé' : 'Désactivé'}
      </Button>
    </div>
  )
}

function SelectControl({ label, value, disabled, options, onChange }: { label: string; value: string; disabled: boolean; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14, display: 'grid', gap: 10 }}>
      <strong>{label}</strong>
      <Select value={value} disabled={disabled} onChange={onChange} options={options} aria-label={label} />
    </div>
  )
}
