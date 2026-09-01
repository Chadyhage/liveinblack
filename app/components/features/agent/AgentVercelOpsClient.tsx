'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Gauge, RefreshCw, ServerCog, ShieldCheck } from 'lucide-react'
import { Badge, Button, Card, DashboardPageHeader, Select, SkeletonCard } from '@/app/components/ui'
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
  strictExpectedFailures: number
  commands: Array<{
    key: string
    label: string
    command: string
    scope: string
    requiredFor100: boolean
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

interface ProUtilizationModeSummary {
  mode: 'prepared' | 'live-proof-needed' | 'proved'
  tone: 'teal' | 'gold' | 'danger' | 'neutral'
  label: string
  summary: string
  nextActionLabel: string
  nextActionCommand: string
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

  return (
    <main className="lb-dashboard-page">
      <DashboardPageHeader
        eyebrow="Vercel Pro"
        title="Ops Vercel"
        description="Suivi interne des signaux Vercel: événements plateforme, budget, drains et alertes utiles."
        actions={
          <Button variant="secondary" onClick={() => load()} loading={loading} icon={<RefreshCw size={16} aria-hidden="true" />}>
            Actualiser
          </Button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Card accent="var(--primary-a35)"><Metric icon={<ServerCog size={19} />} label="Plateforme" value={counts.platform} /></Card>
        <Card accent="var(--primary-a35)"><Metric icon={<Gauge size={19} />} label="Budget" value={counts.spend} /></Card>
        <Card accent="var(--primary-a35)"><Metric icon={<Activity size={19} />} label="Drain logs" value={counts.drain} /></Card>
        <Card accent={counts.urgent > 0 ? 'var(--danger)' : 'var(--primary-a35)'}><Metric icon={<AlertTriangle size={19} />} label="Prioritaires" value={counts.urgent} /></Card>
      </div>

      {proUtilizationMode ? <ProUtilizationModeCard mode={proUtilizationMode} copiedCommand={copiedCommand} onCopyCommand={copyCommand} /> : null}

      {completionVerdict ? <CompletionVerdictCard verdict={completionVerdict} copiedCommand={copiedCommand} onCopyCommand={copyCommand} /> : null}

      {nextAction ? <NextActionCard nextAction={nextAction} copiedCommand={copiedCommand} onCopyCommand={copyCommand} /> : null}

      {nextProofCapture ? <NextProofCaptureCard proof={nextProofCapture} copiedCommand={copiedCommand} onCopyCommand={copyCommand} /> : null}

      {liveEvidenceMatrix ? <LiveEvidenceMatrixCard matrix={liveEvidenceMatrix} copiedCommand={copiedCommand} onCopyCommand={copyCommand} /> : null}

      {actionBlockers ? <ActionBlockersCard actionBlockers={actionBlockers} /> : null}

      {riskCost ? <RiskCostCard riskCost={riskCost} /> : null}

      {dashboardLinks ? <DashboardLinksCard dashboardLinks={dashboardLinks} /> : null}

      <Card style={{ marginBottom: 18 }} accent={readinessScore >= 80 ? 'var(--primary-a35)' : 'var(--warning)'}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Baromètre Vercel Pro</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
              Lecture rapide de ce qui est déjà branché et de ce qui manque encore pour exploiter Pro à fond.
            </p>
          </div>
          <Badge tone={readinessScore >= 80 ? 'teal' : 'gold'}>{readinessScore}% activé</Badge>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {readinessItems.map((item) => (
            <ReadinessRow key={item.label} label={item.label} detail={item.detail} done={item.done} />
          ))}
        </div>
      </Card>

      {proDecisions ? (
        <Card style={{ marginBottom: 18 }} accent={proDecisions.score >= 100 ? 'var(--primary-a35)' : 'var(--warning)'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Feuille de route 100%</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                Les briques Pro doivent finir soit activées, soit rejetées avec une raison claire.
              </p>
            </div>
            <Badge tone={proDecisions.score >= 100 ? 'teal' : 'gold'}>{proDecisions.finalised}/{proDecisions.total} finalisées</Badge>
          </div>
          {proDecisions.remaining.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>Toutes les décisions Pro sont finalisées.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {proDecisions.remaining.map((item) => (
                <DecisionRow key={item.key} label={item.label} status={item.status} nextAction={item.nextAction} />
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {usageWatchlist ? (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Suivi Usage Pro</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                Les métriques Vercel à regarder pour éviter de payer Pro sans piloter les coûts et la performance.
              </p>
            </div>
            <Badge tone="teal">{usageWatchlist.total} métriques</Badge>
          </div>
          {usageWatchlist.items.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>Aucune métrique Usage configurée.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {usageWatchlist.items.map((item) => (
                <UsageRow key={item.key} label={item.label} dashboard={item.dashboard} owner={item.owner} actionIfBad={item.actionIfBad} />
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {liveActivationGates ? (
        <Card style={{ marginBottom: 18 }} accent={liveActivationGates.remaining > 0 ? 'var(--warning)' : 'var(--primary-a35)'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Portes live restantes</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                Les actions encore ouvertes côté Vercel ou dashboard avant de déclarer Pro utilisé à 100%.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge tone={liveActivationGates.remaining > 0 ? 'gold' : 'teal'}>{liveActivationGates.remaining} restante(s)</Badge>
              <Badge tone="neutral">{liveActivationGates.closed}/{liveActivationGates.total} fermée(s)</Badge>
            </div>
          </div>
          {liveActivationGates.gates.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>Toutes les portes live documentées sont fermées ou rejetées.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {liveActivationGates.gates.map((gate) => (
                <LiveGateRow
                  key={gate.key}
                  label={gate.label}
                  status={gate.status}
                  evidenceRequired={gate.evidenceRequired}
                  safeNextAction={gate.safeNextAction}
                  riskIfForced={gate.riskIfForced}
                />
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {activationOrder ? (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Ordre recommandé</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                La séquence restante la plus sûre pour passer de “préparé” à “activé live” sans créer d’incident.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge tone={activationOrder.remaining > 0 ? 'gold' : 'teal'}>{activationOrder.remaining} restante(s)</Badge>
              <Badge tone="neutral">{activationOrder.closed}/{activationOrder.total} fermée(s)</Badge>
            </div>
          </div>
          {activationOrder.steps.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>Toutes les étapes ordonnées sont fermées ou rejetées.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {activationOrder.steps.map((step) => (
                <ActivationStepRow
                  key={step.gateKey}
                  rank={step.rank}
                  label={step.label}
                  owner={step.owner}
                  automationLevel={step.automationLevel}
                  whyFirst={step.whyFirst}
                  preflight={step.preflight}
                  commandOrPlace={step.commandOrPlace}
                  doneWhen={step.doneWhen}
                />
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {completionEvidence ? (
        <Card style={{ marginBottom: 18 }} accent={completionEvidence.score >= 100 ? 'var(--primary-a35)' : 'var(--warning)'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Preuves du 100%</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                Ce qui doit être prouvé avant de dire honnêtement que Vercel Pro est utilisé à 100%.
              </p>
            </div>
            <Badge tone={completionEvidence.score >= 100 ? 'teal' : 'gold'}>{completionEvidence.complete}/{completionEvidence.total} prouvées</Badge>
          </div>
          {completionEvidence.requirements.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>Aucune preuve de complétion documentée.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {completionEvidence.requirements.map((requirement) => (
                <CompletionRequirementRow
                  key={requirement.key}
                  label={requirement.label}
                  status={requirement.status}
                  evidenceSource={requirement.evidenceSource}
                  evidenceRequired={requirement.evidenceRequired}
                  currentEvidence={requirement.currentEvidence}
                  nextAction={requirement.nextAction}
                  evidenceRecordCommand={requirement.evidenceRecordCommand}
                  copiedCommand={copiedCommand}
                  onCopyCommand={copyCommand}
                />
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {auditSuite ? (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Suite d’audit 100%</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                Les commandes à lancer pour passer du diagnostic local au 100% prouvé côté Vercel.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge tone="neutral">{auditSuite.local} local</Badge>
              <Badge tone="gold">{auditSuite.liveRead} live-read</Badge>
            </div>
          </div>
          {auditSuite.commands.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>Aucune suite d’audit configurée.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              {auditSuite.commands.map((command) => (
                <AuditCommandRow
                  key={command.key}
                  label={command.label}
                  command={command.command}
                  scope={command.scope}
                  expectedBeforeLiveComplete={command.expectedBeforeLiveComplete}
                  copiedCommand={copiedCommand}
                  onCopyCommand={copyCommand}
                />
              ))}
            </div>
          )}
        </Card>
      ) : null}

      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Pilotage live Edge Config</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
              Ces réglages pilotent maintenance, checkout, revente, recherche et cache sans redéploiement.
            </p>
          </div>
          <Badge tone={configWritable ? 'teal' : 'neutral'}>{configWritable ? 'Écriture active' : 'Lecture seule'}</Badge>
        </div>

        {configError ? (
          <p style={{ color: 'var(--danger)', margin: '0 0 12px', fontWeight: 700 }}>Lecture ou mise à jour Edge Config impossible.</p>
        ) : null}

        {configLoading || !config ? (
          <SkeletonCard />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 12 }}>
              <QuickMode
                title="Mode normal"
                description="Rouvre l'expérience publique: maintenance coupée, checkout et revente actifs."
                disabled={!configWritable || savingKey === 'preset-normal'}
                onClick={() => requestConfigPatch({
                  title: 'Repasser en mode normal ?',
                  body: 'Le site public reprend son fonctionnement standard: maintenance désactivée, checkout actif et revente active.',
                  confirmLabel: 'Activer le mode normal',
                  confirmVariant: 'primary',
                  patch: { maintenanceMode: false, checkoutEnabled: true, ticketResaleEnabled: true },
                  savingKey: 'preset-normal',
                })}
              />
              <QuickMode
                title="Mode urgence"
                description="Ferme les actions commerciales critiques en un geste: maintenance active, checkout et revente coupés."
                disabled={!configWritable || savingKey === 'preset-emergency'}
                danger
                onClick={() => requestConfigPatch({
                  title: 'Activer le mode urgence ?',
                  body: 'Cette action met le site en maintenance et coupe les achats ainsi que la revente sans redéploiement. À utiliser seulement en cas d’incident réel.',
                  confirmLabel: 'Activer l’urgence',
                  confirmVariant: 'danger',
                  patch: { maintenanceMode: true, checkoutEnabled: false, ticketResaleEnabled: false },
                  savingKey: 'preset-emergency',
                })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              <FlagControl
                label="Maintenance"
                description="Coupe les APIs publiques critiques."
                active={config.maintenanceMode}
                disabled={!configWritable || savingKey === 'maintenanceMode'}
                onToggle={() => requestConfigPatch({
                  title: config.maintenanceMode ? 'Désactiver la maintenance ?' : 'Activer la maintenance ?',
                  body: config.maintenanceMode
                    ? 'Les APIs publiques critiques seront rouvertes. Vérifie que l’incident est terminé avant de confirmer.'
                    : 'Les APIs publiques critiques seront coupées immédiatement, sans redéploiement.',
                  confirmLabel: config.maintenanceMode ? 'Rouvrir le site' : 'Activer la maintenance',
                  confirmVariant: config.maintenanceMode ? 'primary' : 'danger',
                  patch: { maintenanceMode: !config.maintenanceMode },
                  savingKey: 'maintenanceMode',
                })}
                danger={config.maintenanceMode}
              />
              <FlagControl
                label="Checkout"
                description="Autorise les achats Stripe/FedaPay."
                active={config.checkoutEnabled}
                disabled={!configWritable || savingKey === 'checkoutEnabled'}
                onToggle={() => requestConfigPatch({
                  title: config.checkoutEnabled ? 'Couper le checkout ?' : 'Réactiver le checkout ?',
                  body: config.checkoutEnabled
                    ? 'Les achats Stripe/FedaPay seront bloqués immédiatement. Les visiteurs ne pourront plus payer.'
                    : 'Les achats Stripe/FedaPay seront à nouveau autorisés pour les visiteurs.',
                  confirmLabel: config.checkoutEnabled ? 'Couper le checkout' : 'Réactiver le checkout',
                  confirmVariant: config.checkoutEnabled ? 'danger' : 'primary',
                  patch: { checkoutEnabled: !config.checkoutEnabled },
                  savingKey: 'checkoutEnabled',
                })}
              />
              <FlagControl
                label="Revente"
                description="Autorise la bourse officielle."
                active={config.ticketResaleEnabled}
                disabled={!configWritable || savingKey === 'ticketResaleEnabled'}
                onToggle={() => requestConfigPatch({
                  title: config.ticketResaleEnabled ? 'Couper la revente ?' : 'Réactiver la revente ?',
                  body: config.ticketResaleEnabled
                    ? 'La bourse officielle sera bloquée immédiatement pour éviter de nouveaux mouvements.'
                    : 'La bourse officielle sera à nouveau disponible pour les billets éligibles.',
                  confirmLabel: config.ticketResaleEnabled ? 'Couper la revente' : 'Réactiver la revente',
                  confirmVariant: config.ticketResaleEnabled ? 'danger' : 'primary',
                  patch: { ticketResaleEnabled: !config.ticketResaleEnabled },
                  savingKey: 'ticketResaleEnabled',
                })}
              />
              <SelectControl
                label="Recherche min."
                value={String(config.searchMinQueryLength)}
                disabled={!configWritable || savingKey === 'searchMinQueryLength'}
                options={[1, 2, 3, 4, 5, 6, 7, 8].map((value) => ({ value: String(value), label: `${value} caractère${value > 1 ? 's' : ''}` }))}
                onChange={(value) => patchConfig({ searchMinQueryLength: Number(value) }, 'searchMinQueryLength')}
              />
              <SelectControl
                label="Cache recherche"
                value={String(config.publicCacheTtlSeconds)}
                disabled={!configWritable || savingKey === 'publicCacheTtlSeconds'}
                options={[15, 30, 45, 60, 120, 300].map((value) => ({ value: String(value), label: `${value}s` }))}
                onChange={(value) => patchConfig({ publicCacheTtlSeconds: Number(value) }, 'publicCacheTtlSeconds')}
              />
            </div>
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 'var(--font-size-title-5)' }}>Derniers changements</h3>
              {changes.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>Aucun changement enregistré pour l’instant.</p>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {changes.map((change) => (
                    <div key={change.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                      <span><strong style={{ color: 'var(--text)' }}>{change.key}</strong> : {String(change.previousValue)} → {String(change.nextValue)}</span>
                      <span>{change.actorEmail || 'Agent'} · {fmtDate(change.changedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 260px) 1fr', gap: 14, alignItems: 'center' }}>
          <Select value={source} onChange={onSourceChange} options={SOURCE_OPTIONS} aria-label="Filtrer les événements Vercel" />
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
            Les payloads bruts restent masqués par défaut. On affiche ici les signaux actionnables pour l’équipe agent.
          </p>
        </div>
      </Card>

      {error ? (
        <Card accent="var(--danger)">
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Impossible de charger les événements Vercel. Réessaie ou vérifie les droits agent.</p>
        </Card>
      ) : loading ? (
        <div className="lb-dashboard-card-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : events.length === 0 ? (
        <Card>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <ShieldCheck size={24} color="var(--primary)" aria-hidden="true" />
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)' }}>Aucun événement pour ce filtre</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>Les événements apparaîtront après activation des webhooks Vercel ou du Log Drain.</p>
            </div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {events.map((event) => (
            <Card key={`${event.source}-${event.id}`} accent={event.source === 'spend' && (event.thresholdPercent ?? 0) >= 100 ? 'var(--danger)' : undefined}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge tone={badgeTone(event)}>{SOURCE_LABEL[event.source]}</Badge>
                    <strong style={{ fontSize: 'var(--font-size-title-5)' }}>{event.type || event.message || 'Signal Vercel'}</strong>
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
                    {event.message || [
                      shortId(event.projectId) ? `Projet ${shortId(event.projectId)}` : null,
                      shortId(event.deploymentId) ? `Déploiement ${shortId(event.deploymentId)}` : null,
                      event.region ? `Région ${event.region}` : null,
                    ].filter(Boolean).join(' · ') || 'Événement opérationnel Vercel'}
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: 'var(--text-faint)', fontSize: 'var(--font-size-footnote-lg)' }}>
                    {event.thresholdPercent != null ? <span>Seuil {event.thresholdPercent}%</span> : null}
                    {event.currentSpend != null ? <span>Dépense {event.currentSpend}</span> : null}
                    {event.eventCount != null ? <span>{event.eventCount} événement(s)</span> : null}
                    {shortId(event.requestId) ? <span>Req {shortId(event.requestId)}</span> : null}
                    <span>{fmtDate(event.receivedAt)}</span>
                  </div>
                </div>
                {event.autoMaintenanceTriggered ? <Badge tone="danger">Maintenance activée</Badge> : null}
              </div>
            </Card>
          ))}
        </div>
      )}
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
  expectedBeforeLiveComplete,
  copiedCommand,
  onCopyCommand,
}: {
  label: string
  command: string
  scope: string
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
        <Badge tone={tone}>{scopeLabel}</Badge>
      </div>
      <CommandLine label="Commande" command={command} copied={copiedCommand === command} onCopy={onCopyCommand} muted />
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>
        {expectedBeforeLiveComplete === 'fail-until-live-proof'
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
