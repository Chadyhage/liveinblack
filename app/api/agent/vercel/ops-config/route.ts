import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import { clearVercelOpsConfigCache, getVercelOpsConfig } from '@/lib/server/vercelEdgeConfig'
import { getDb } from '@/lib/db/mongoose'
import VercelOpsConfigChange from '@/lib/models/VercelOpsConfigChange'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

type PatchBody = Partial<{
  maintenanceMode: boolean
  checkoutEnabled: boolean
  ticketResaleEnabled: boolean
  searchMinQueryLength: number
  publicCacheTtlSeconds: number
}>

const KEY_MAP = {
  maintenanceMode: 'maintenance_mode',
  checkoutEnabled: 'checkout_enabled',
  ticketResaleEnabled: 'ticket_resale_enabled',
  searchMinQueryLength: 'search_min_query_length',
  publicCacheTtlSeconds: 'public_cache_ttl_seconds',
} as const

type ConfigKey = keyof typeof KEY_MAP

interface ProDecisionItem {
  key: string
  label: string
  status: 'active' | 'prepared' | 'planned' | 'rejected'
  evidence: string
  nextAction: string
}

interface UsageWatchItem {
  key: string
  label: string
  dashboard: string
  owner: string
  cadence: string
  healthySignal: string
  actionIfBad: string
}

interface LiveActivationGate {
  key: string
  label: string
  decisionKey: string
  status: string
  evidenceRequired: string
  safeNextAction: string
  riskIfForced: string
}

interface ActivationOrderStep {
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

interface CompletionRequirement {
  key: string
  label: string
  status: string
  evidenceSource: string
  evidenceRequired: string
  currentEvidence: string
  nextAction: string
}

interface AuditSuiteCommand {
  key: string
  label: string
  command: string
  scope: string
  requiredFor100: boolean
  expectedBeforeLiveComplete: string
}

interface NextActionSummary {
  open: boolean
  label: string
  completionScore: number
  step?: ActivationOrderStep
  gate?: LiveActivationGate
  decision?: Pick<ProDecisionItem, 'key' | 'label' | 'status' | 'evidence' | 'nextAction'>
  followUpCommand: string
  proofCommand?: string
  dashboardHref?: string
  dashboardLabel?: string
  safetyLevel?: 'safe-prep' | 'manual-live' | 'explicit-approval'
  safetyMessage?: string
  preflightChecklist?: string[]
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

function buildEvidenceRecordCommand({
  key,
  nextAction,
  decisionKey,
}: {
  key: string
  nextAction?: string
  decisionKey?: string
}) {
  const next = nextAction || 'Relancer audit:vercel-pro-suite -- --strict --include-live'
  const parts = [
    `npm run ops:vercel:evidence:record -- --key ${key}`,
    '--status complete',
    '--evidence "preuve live observee"',
    `--next "${next}"`,
  ]
  if (decisionKey) {
    parts.push(`--decision-key ${decisionKey}`)
    parts.push('--decision-status active')
    parts.push('--decision-evidence "preuve live observee"')
    parts.push('--decision-next "surveiller dans /agent/vercel"')
  }
  return parts.join(' ')
}

function parseEdgeConfigId() {
  const connection = process.env.EDGE_CONFIG || ''
  try {
    const url = new URL(connection)
    return url.pathname.split('/').filter(Boolean)[0] || process.env.VERCEL_EDGE_CONFIG_ID || ''
  } catch {
    return connection.match(/id=([^&]+)/)?.[1] || process.env.VERCEL_EDGE_CONFIG_ID || ''
  }
}

async function getLinkedVercelProject() {
  try {
    const text = await fs.readFile(path.join(process.cwd(), '.vercel/project.json'), 'utf8')
    const parsed = JSON.parse(text) as { orgId?: string; projectId?: string }
    return {
      teamId: parsed.orgId || '',
      projectId: parsed.projectId || '',
      teamBase: parsed.orgId ? `https://vercel.com/dashboard/${parsed.orgId}` : 'https://vercel.com/dashboard',
    }
  } catch {
    return {
      teamId: '',
      projectId: '',
      teamBase: 'https://vercel.com/dashboard',
    }
  }
}

function dashboardTargetForGate(gateKey: string | undefined, teamBase: string) {
  if (gateKey === 'spend-management-dashboard') {
    return {
      href: `${teamBase}/~/settings/billing`,
      label: 'Ouvrir Billing / Spend Management',
    }
  }
  if (gateKey === 'firewall-publish') {
    return {
      href: `${teamBase}/~/firewall`,
      label: 'Ouvrir Firewall / WAF',
    }
  }
  if (gateKey === 'account-webhook-live') {
    return {
      href: `${teamBase}/~/settings/webhooks`,
      label: 'Ouvrir Webhooks',
    }
  }
  if (gateKey === 'log-drain-live') {
    return {
      href: `${teamBase}/~/settings/log-drains`,
      label: 'Ouvrir Log Drains',
    }
  }
  return {
    href: teamBase,
    label: 'Ouvrir Vercel',
  }
}

function safetyForAutomationLevel(automationLevel: string | undefined) {
  if (automationLevel === 'requires-explicit-approval') {
    return {
      safetyLevel: 'explicit-approval' as const,
      safetyMessage: 'Ne pas lancer automatiquement: cette action touche au live et demande un accord explicite.',
    }
  }
  if (automationLevel?.includes('manual')) {
    return {
      safetyLevel: 'manual-live' as const,
      safetyMessage: 'Action live a faire ou confirmer humainement apres revue du dashboard.',
    }
  }
  return {
    safetyLevel: 'safe-prep' as const,
    safetyMessage: 'Preparation automatisable: verifier la sortie, puis consigner la preuve avant de passer a la suite.',
  }
}

function buildPreflightChecklist({
  step,
  gate,
  dashboardLabel,
  safetyMessage,
}: {
  step?: ActivationOrderStep
  gate?: LiveActivationGate
  dashboardLabel?: string
  safetyMessage?: string
}) {
  if (!step) {
    return [
      'Relancer la suite stricte avec lecture live.',
      'Verifier que toutes les preuves live sont consignees.',
      'Confirmer que chaque decision Pro est active ou rejected.',
    ]
  }

  return [
    `Responsable: ${step.owner}.`,
    `Preflight: ${step.preflight}`,
    dashboardLabel ? `Dashboard: ${dashboardLabel}.` : 'Dashboard: ouvrir le bon scope Vercel Pro.',
    gate ? `Preuve attendue: ${gate.evidenceRequired}` : `Termine quand: ${step.doneWhen}`,
    safetyMessage ? `Securite: ${safetyMessage}` : 'Securite: confirmer avant toute action live.',
  ]
}

function riskTypeForGate(gateKey: string): RiskCostSummary['items'][number]['riskType'] {
  if (gateKey === 'spend-management-dashboard') return 'cost'
  if (gateKey === 'firewall-publish') return 'security'
  if (gateKey === 'log-drain-live') return 'observability'
  if (gateKey === 'workflow-first-migration') return 'architecture'
  return 'platform'
}

function severityForStep(step: ActivationOrderStep, gate?: LiveActivationGate): RiskCostSummary['items'][number]['severity'] {
  if (step.automationLevel === 'requires-explicit-approval') return 'high'
  if (gate?.riskIfForced.toLowerCase().includes('bloquer') || gate?.riskIfForced.toLowerCase().includes('doubler')) return 'high'
  if (step.automationLevel.includes('manual')) return 'medium'
  return 'low'
}

function writableState() {
  const token = process.env.VERCEL_API_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID
  const edgeConfigId = parseEdgeConfigId()
  return { writable: Boolean(token && teamId && edgeConfigId), token, teamId, edgeConfigId }
}

function opsStatus() {
  const { writable } = writableState()
  return {
    edgeConfigWritable: writable,
    spendWebhookSecretConfigured: Boolean(process.env.VERCEL_SPEND_WEBHOOK_SECRET),
    spendAutoMaintenanceEnabled: process.env.VERCEL_SPEND_AUTO_MAINTENANCE === '1',
    accountWebhookSecretConfigured: Boolean(process.env.VERCEL_ACCOUNT_WEBHOOK_SECRET),
    drainSecretConfigured: Boolean(process.env.DRAIN_SECRET),
    drainUrlConfigured: Boolean(process.env.VERCEL_DRAIN_URL || process.env.ERROR_WEBHOOK_URL),
  }
}

async function getProDecisionSummary() {
  try {
    const text = await fs.readFile(path.join(process.cwd(), 'config/vercel-pro-decisions.json'), 'utf8')
    const parsed = JSON.parse(text) as { items?: ProDecisionItem[] }
    const items = Array.isArray(parsed.items) ? parsed.items : []
    const remaining = items.filter((item) => item.status !== 'active' && item.status !== 'rejected')
    const finalised = items.length - remaining.length
    return {
      total: items.length,
      finalised,
      score: items.length > 0 ? Math.round((finalised / items.length) * 100) : 0,
      remaining: remaining.map((item) => ({
        key: item.key,
        label: item.label,
        status: item.status,
        nextAction: item.nextAction,
      })),
    }
  } catch {
    return {
      total: 0,
      finalised: 0,
      score: 0,
      remaining: [],
    }
  }
}

async function getUsageWatchlistSummary() {
  try {
    const text = await fs.readFile(path.join(process.cwd(), 'config/vercel-usage-watchlist.json'), 'utf8')
    const parsed = JSON.parse(text) as { items?: UsageWatchItem[]; dashboardCadence?: string }
    const items = Array.isArray(parsed.items) ? parsed.items : []
    return {
      total: items.length,
      cadence: parsed.dashboardCadence || 'weekly',
      items: items.map((item) => ({
        key: item.key,
        label: item.label,
        dashboard: item.dashboard,
        owner: item.owner,
        healthySignal: item.healthySignal,
        actionIfBad: item.actionIfBad,
      })),
    }
  } catch {
    return {
      total: 0,
      cadence: 'weekly',
      items: [],
    }
  }
}

async function getLiveActivationGatesSummary() {
  try {
    const [gatesText, decisionsText] = await Promise.all([
      fs.readFile(path.join(process.cwd(), 'config/vercel-live-activation-gates.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'config/vercel-pro-decisions.json'), 'utf8'),
    ])
    const parsed = JSON.parse(gatesText) as { gates?: LiveActivationGate[] }
    const decisions = JSON.parse(decisionsText) as { items?: ProDecisionItem[] }
    const gates = Array.isArray(parsed.gates) ? parsed.gates : []
    const decisionItems = Array.isArray(decisions.items) ? decisions.items : []
    const decisionByKey = new Map(decisionItems.map((item) => [item.key, item]))
    const remainingGates = gates.filter((gate) => {
      const decision = decisionByKey.get(gate.decisionKey)
      return !decision || (decision.status !== 'active' && decision.status !== 'rejected')
    })
    return {
      total: gates.length,
      remaining: remainingGates.length,
      closed: gates.length - remainingGates.length,
      gates: remainingGates.map((gate) => ({
        key: gate.key,
        label: gate.label,
        decisionKey: gate.decisionKey,
        status: gate.status,
        evidenceRequired: gate.evidenceRequired,
        safeNextAction: gate.safeNextAction,
        riskIfForced: gate.riskIfForced,
      })),
    }
  } catch {
    return {
      total: 0,
      remaining: 0,
      closed: 0,
      gates: [],
    }
  }
}

async function getActivationOrderSummary() {
  try {
    const [orderText, gatesText, decisionsText] = await Promise.all([
      fs.readFile(path.join(process.cwd(), 'config/vercel-pro-activation-order.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'config/vercel-live-activation-gates.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'config/vercel-pro-decisions.json'), 'utf8'),
    ])
    const parsed = JSON.parse(orderText) as { steps?: ActivationOrderStep[] }
    const gatesPlan = JSON.parse(gatesText) as { gates?: LiveActivationGate[] }
    const decisions = JSON.parse(decisionsText) as { items?: ProDecisionItem[] }
    const steps = Array.isArray(parsed.steps) ? parsed.steps : []
    const gates = Array.isArray(gatesPlan.gates) ? gatesPlan.gates : []
    const decisionItems = Array.isArray(decisions.items) ? decisions.items : []
    const gateByKey = new Map(gates.map((gate) => [gate.key, gate]))
    const decisionByKey = new Map(decisionItems.map((item) => [item.key, item]))
    const remainingSteps = steps.filter((step) => {
      const gate = gateByKey.get(step.gateKey)
      const decision = gate ? decisionByKey.get(gate.decisionKey) : null
      return !decision || (decision.status !== 'active' && decision.status !== 'rejected')
    })
    return {
      total: steps.length,
      remaining: remainingSteps.length,
      closed: steps.length - remainingSteps.length,
      steps: remainingSteps
        .slice()
        .sort((a, b) => Number(a.rank) - Number(b.rank))
        .map((step) => ({
          rank: step.rank,
          gateKey: step.gateKey,
          label: step.label,
          owner: step.owner,
          automationLevel: step.automationLevel,
          whyFirst: step.whyFirst,
          preflight: step.preflight,
          commandOrPlace: step.commandOrPlace,
          doneWhen: step.doneWhen,
        })),
    }
  } catch {
    return {
      total: 0,
      remaining: 0,
      closed: 0,
      steps: [],
    }
  }
}

async function getCompletionEvidenceSummary() {
  try {
    const text = await fs.readFile(path.join(process.cwd(), 'config/vercel-pro-completion-evidence.json'), 'utf8')
    const parsed = JSON.parse(text) as { requirements?: CompletionRequirement[] }
    const requirements = Array.isArray(parsed.requirements) ? parsed.requirements : []
    const complete = requirements.filter((item) => item.status === 'complete').length
    return {
      total: requirements.length,
      complete,
      score: requirements.length > 0 ? Math.round((complete / requirements.length) * 100) : 0,
      requirements: requirements.map((item) => ({
        key: item.key,
        label: item.label,
        status: item.status,
        evidenceSource: item.evidenceSource,
        evidenceRequired: item.evidenceRequired,
        currentEvidence: item.currentEvidence,
        nextAction: item.nextAction,
        evidenceRecordCommand: buildEvidenceRecordCommand({ key: item.key, nextAction: item.nextAction }),
      })),
    }
  } catch {
    return {
      total: 0,
      complete: 0,
      score: 0,
      requirements: [],
    }
  }
}

async function getAuditSuiteSummary() {
  try {
    const text = await fs.readFile(path.join(process.cwd(), 'config/vercel-pro-audit-suite.json'), 'utf8')
    const parsed = JSON.parse(text) as { commands?: AuditSuiteCommand[] }
    const commands = Array.isArray(parsed.commands) ? parsed.commands : []
    return {
      total: commands.length,
      local: commands.filter((item) => item.scope === 'local').length,
      liveRead: commands.filter((item) => item.scope === 'live-read').length,
      strictExpectedFailures: commands.filter((item) => item.expectedBeforeLiveComplete === 'fail-until-live-proof').length,
      commands: commands.map((item) => ({
        key: item.key,
        label: item.label,
        command: item.command,
        scope: item.scope,
        requiredFor100: item.requiredFor100,
        expectedBeforeLiveComplete: item.expectedBeforeLiveComplete,
      })),
    }
  } catch {
    return {
      total: 0,
      local: 0,
      liveRead: 0,
      strictExpectedFailures: 0,
      commands: [],
    }
  }
}

async function getNextActionSummary(): Promise<NextActionSummary> {
  try {
    const [orderText, gatesText, decisionsText, completionText] = await Promise.all([
      fs.readFile(path.join(process.cwd(), 'config/vercel-pro-activation-order.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'config/vercel-live-activation-gates.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'config/vercel-pro-decisions.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'config/vercel-pro-completion-evidence.json'), 'utf8'),
    ])
    const order = JSON.parse(orderText) as { steps?: ActivationOrderStep[] }
    const gatesPlan = JSON.parse(gatesText) as { gates?: LiveActivationGate[] }
    const decisions = JSON.parse(decisionsText) as { items?: ProDecisionItem[] }
    const completion = JSON.parse(completionText) as { requirements?: CompletionRequirement[] }
    const steps = Array.isArray(order.steps) ? order.steps.slice().sort((a, b) => Number(a.rank) - Number(b.rank)) : []
    const gates = Array.isArray(gatesPlan.gates) ? gatesPlan.gates : []
    const decisionItems = Array.isArray(decisions.items) ? decisions.items : []
    const requirements = Array.isArray(completion.requirements) ? completion.requirements : []
    const gateByKey = new Map(gates.map((gate) => [gate.key, gate]))
    const decisionByKey = new Map(decisionItems.map((item) => [item.key, item]))
    const nextStep = steps.find((step) => {
      const gate = gateByKey.get(step.gateKey)
      const decision = gate ? decisionByKey.get(gate.decisionKey) : null
      return !decision || (decision.status !== 'active' && decision.status !== 'rejected')
    })
    const completionScore = requirements.length > 0
      ? Math.round((requirements.filter((item) => item.status === 'complete').length / requirements.length) * 100)
      : 0

    if (!nextStep) {
      return {
        open: false,
        label: 'Toutes les étapes ordonnées sont finalisées',
        completionScore,
        followUpCommand: 'npm run audit:vercel-pro-suite -- --strict --include-live',
        preflightChecklist: buildPreflightChecklist({}),
      }
    }

    const gate = gateByKey.get(nextStep.gateKey)
    const decision = gate ? decisionByKey.get(gate.decisionKey) : undefined
    const linkedProject = await getLinkedVercelProject()
    const dashboardTarget = dashboardTargetForGate(nextStep.gateKey, linkedProject.teamBase)
    const safety = safetyForAutomationLevel(nextStep.automationLevel)
    return {
      open: true,
      label: nextStep.label,
      completionScore,
      step: nextStep,
      gate,
      decision: decision
        ? {
            key: decision.key,
            label: decision.label,
            status: decision.status,
            evidence: decision.evidence,
            nextAction: decision.nextAction,
          }
        : undefined,
      followUpCommand: 'npm run ops:vercel:next-action',
      proofCommand: buildEvidenceRecordCommand({
        key: 'live-gates-closed',
        nextAction: `continuer avec la prochaine porte apres ${nextStep.label}`,
        decisionKey: gate?.decisionKey,
      }),
      dashboardHref: dashboardTarget.href,
      dashboardLabel: dashboardTarget.label,
      safetyLevel: safety.safetyLevel,
      safetyMessage: safety.safetyMessage,
      preflightChecklist: buildPreflightChecklist({
        step: nextStep,
        gate,
        dashboardLabel: dashboardTarget.label,
        safetyMessage: safety.safetyMessage,
      }),
    }
  } catch {
    return {
      open: false,
      label: 'Prochaine action indisponible',
      completionScore: 0,
      followUpCommand: 'npm run ops:vercel:next-action',
      preflightChecklist: [
        'Relancer le diagnostic local.',
        'Verifier les fichiers de configuration Vercel Pro.',
        'Revenir sur /agent/vercel apres correction.',
      ],
    }
  }
}

async function getActionBlockerSummary(): Promise<ActionBlockerSummary> {
  try {
    const [orderText, gatesText, decisionsText] = await Promise.all([
      fs.readFile(path.join(process.cwd(), 'config/vercel-pro-activation-order.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'config/vercel-live-activation-gates.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'config/vercel-pro-decisions.json'), 'utf8'),
    ])
    const order = JSON.parse(orderText) as { steps?: ActivationOrderStep[] }
    const gatesPlan = JSON.parse(gatesText) as { gates?: LiveActivationGate[] }
    const decisions = JSON.parse(decisionsText) as { items?: ProDecisionItem[] }
    const steps = Array.isArray(order.steps) ? order.steps : []
    const gates = Array.isArray(gatesPlan.gates) ? gatesPlan.gates : []
    const decisionItems = Array.isArray(decisions.items) ? decisions.items : []
    const gateByKey = new Map(gates.map((gate) => [gate.key, gate]))
    const decisionByKey = new Map(decisionItems.map((item) => [item.key, item]))
    const openSteps = steps.filter((step) => {
      const gate = gateByKey.get(step.gateKey)
      const decision = gate ? decisionByKey.get(gate.decisionKey) : null
      return !decision || (decision.status !== 'active' && decision.status !== 'rejected')
    })
    const ownerCounts = new Map<string, number>()
    for (const step of openSteps) ownerCounts.set(step.owner, (ownerCounts.get(step.owner) || 0) + 1)
    const ownerLoad = Array.from(ownerCounts.entries())
      .map(([owner, count]) => ({ owner, count }))
      .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
    return {
      totalOpen: openSteps.length,
      automated: openSteps.filter((step) => !step.automationLevel.includes('manual') && step.automationLevel !== 'requires-explicit-approval').length,
      manual: openSteps.filter((step) => step.automationLevel.includes('manual')).length,
      explicitApproval: openSteps.filter((step) => step.automationLevel === 'requires-explicit-approval').length,
      topOwner: ownerLoad[0]?.owner || 'Aucun',
      ownerLoad,
    }
  } catch {
    return {
      totalOpen: 0,
      automated: 0,
      manual: 0,
      explicitApproval: 0,
      topOwner: 'Indisponible',
      ownerLoad: [],
    }
  }
}

async function getRiskCostSummary(): Promise<RiskCostSummary> {
  try {
    const [orderText, gatesText, decisionsText] = await Promise.all([
      fs.readFile(path.join(process.cwd(), 'config/vercel-pro-activation-order.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'config/vercel-live-activation-gates.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'config/vercel-pro-decisions.json'), 'utf8'),
    ])
    const order = JSON.parse(orderText) as { steps?: ActivationOrderStep[] }
    const gatesPlan = JSON.parse(gatesText) as { gates?: LiveActivationGate[] }
    const decisions = JSON.parse(decisionsText) as { items?: ProDecisionItem[] }
    const steps = Array.isArray(order.steps) ? order.steps.slice().sort((a, b) => Number(a.rank) - Number(b.rank)) : []
    const gates = Array.isArray(gatesPlan.gates) ? gatesPlan.gates : []
    const decisionItems = Array.isArray(decisions.items) ? decisions.items : []
    const gateByKey = new Map(gates.map((gate) => [gate.key, gate]))
    const decisionByKey = new Map(decisionItems.map((item) => [item.key, item]))
    const openSteps = steps.filter((step) => {
      const gate = gateByKey.get(step.gateKey)
      const decision = gate ? decisionByKey.get(gate.decisionKey) : null
      return !decision || (decision.status !== 'active' && decision.status !== 'rejected')
    })
    const items = openSteps.map((step) => {
      const gate = gateByKey.get(step.gateKey)
      return {
        key: step.gateKey,
        label: step.label,
        owner: step.owner,
        riskType: riskTypeForGate(step.gateKey),
        severity: severityForStep(step, gate),
        reason: gate?.riskIfForced || step.whyFirst,
        nextAction: gate?.safeNextAction || step.commandOrPlace,
      }
    })
    const explicitApproval = openSteps.filter((step) => step.automationLevel === 'requires-explicit-approval').length
    const liveMutation = openSteps.filter((step) => step.automationLevel.includes('manual') || step.automationLevel === 'requires-explicit-approval').length
    const high = items.filter((item) => item.severity === 'high').length
    const overallTone = explicitApproval > 0 || high > 1 ? 'danger' : openSteps.length > 0 ? 'gold' : 'teal'
    return {
      open: openSteps.length,
      costControl: items.filter((item) => item.riskType === 'cost').length,
      securityControl: items.filter((item) => item.riskType === 'security').length,
      observabilityExport: items.filter((item) => item.riskType === 'observability').length,
      liveMutation,
      explicitApproval,
      overallTone,
      verdict: openSteps.length === 0
        ? 'Aucun risque ouvert dans la sequence Vercel Pro.'
        : explicitApproval > 0
          ? 'Il reste au moins une action live sensible: ne pas automatiser sans accord.'
          : 'Les risques restants sont pilotables avec revue dashboard et preuve apres action.',
      items,
    }
  } catch {
    return {
      open: 0,
      costControl: 0,
      securityControl: 0,
      observabilityExport: 0,
      liveMutation: 0,
      explicitApproval: 0,
      overallTone: 'neutral',
      verdict: 'Lecture risque/cout indisponible.',
      items: [],
    }
  }
}

async function getLiveEvidenceMatrixSummary(): Promise<LiveEvidenceMatrixSummary> {
  try {
    const [gatesText, decisionsText] = await Promise.all([
      fs.readFile(path.join(process.cwd(), 'config/vercel-live-activation-gates.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'config/vercel-pro-decisions.json'), 'utf8'),
    ])
    const gatesPlan = JSON.parse(gatesText) as { gates?: LiveActivationGate[] }
    const decisions = JSON.parse(decisionsText) as { items?: ProDecisionItem[] }
    const gates = Array.isArray(gatesPlan.gates) ? gatesPlan.gates : []
    const decisionItems = Array.isArray(decisions.items) ? decisions.items : []
    const decisionByKey = new Map(decisionItems.map((item) => [item.key, item]))
    const linkedProject = await getLinkedVercelProject()
    const openGates = gates.filter((gate) => {
      const decision = decisionByKey.get(gate.decisionKey)
      return !decision || (decision.status !== 'active' && decision.status !== 'rejected')
    })
    const items = openGates.map((gate) => {
      const dashboard = dashboardTargetForGate(gate.key, linkedProject.teamBase)
      const source = gate.status === 'requires-explicit-approval'
        ? 'explicit-approval' as const
        : gate.status.includes('dashboard') || gate.status.includes('manual')
          ? 'dashboard' as const
          : gate.status.includes('implementation')
            ? 'implementation' as const
            : 'live-audit' as const
      return {
        key: gate.key,
        label: gate.label,
        source,
        status: gate.status,
        evidenceRequired: gate.evidenceRequired,
        proofCommand: buildEvidenceRecordCommand({
          key: 'live-gates-closed',
          nextAction: `preuve live recue pour ${gate.label}`,
          decisionKey: gate.decisionKey,
        }),
        dashboardHref: dashboard.href,
        dashboardLabel: dashboard.label,
      }
    })
    return {
      total: gates.length,
      open: openGates.length,
      liveRead: items.filter((item) => item.source === 'live-audit').length,
      manualDashboard: items.filter((item) => item.source === 'dashboard').length,
      explicitApproval: items.filter((item) => item.source === 'explicit-approval').length,
      items,
    }
  } catch {
    return {
      total: 0,
      open: 0,
      liveRead: 0,
      manualDashboard: 0,
      explicitApproval: 0,
      items: [],
    }
  }
}

async function getProUtilizationModeSummary(): Promise<ProUtilizationModeSummary> {
  const [verdict, riskCost, nextProof] = await Promise.all([
    getCompletionVerdictSummary(),
    getRiskCostSummary(),
    getNextProofCaptureSummary(),
  ])
  if (verdict.ready) {
    return {
      mode: 'proved',
      tone: 'teal',
      label: '100% prouvé',
      summary: 'Toutes les briques Vercel Pro pertinentes sont actives ou rejetées, et les preuves strictes sont consignées.',
      nextActionLabel: 'Continuer la surveillance hebdomadaire Usage, Speed Insights et logs.',
      nextActionCommand: 'npm run audit:vercel-pro-suite -- --strict --include-live',
    }
  }
  if (riskCost.explicitApproval > 0) {
    return {
      mode: 'live-proof-needed',
      tone: 'danger',
      label: 'Live sensible à approuver',
      summary: 'Le projet est largement préparé, mais au moins une preuve live demande un accord explicite avant activation.',
      nextActionLabel: nextProof.guidance,
      nextActionCommand: nextProof.proofCommand,
    }
  }
  return {
    mode: 'prepared',
    tone: 'gold',
    label: 'Préparé, preuves live manquantes',
    summary: 'Le code et les outils sont prêts; il reste à capturer les preuves live/dashboard avant de déclarer le 100%.',
    nextActionLabel: nextProof.guidance,
    nextActionCommand: nextProof.proofCommand,
  }
}

async function getNextProofCaptureSummary(): Promise<NextProofCaptureSummary> {
  const matrix = await getLiveEvidenceMatrixSummary()
  const next = matrix.items[0]
  if (!next) {
    return {
      open: false,
      label: 'Toutes les preuves live sont fermees ou rejetees',
      source: 'none',
      evidenceRequired: 'Relancer la suite stricte live pour confirmer le 100%.',
      proofCommand: 'npm run audit:vercel-pro-suite -- --strict --include-live',
      guidance: 'Aucune porte live ouverte dans la matrice; la prochaine preuve est le passage de la suite stricte.',
    }
  }
  return {
    open: true,
    label: next.label,
    source: next.source,
    evidenceRequired: next.evidenceRequired,
    dashboardHref: next.dashboardHref,
    dashboardLabel: next.dashboardLabel,
    proofCommand: next.proofCommand,
    guidance: next.source === 'explicit-approval'
      ? 'Demander le feu vert humain avant toute activation, puis consigner la preuve seulement apres confirmation live.'
      : next.source === 'dashboard'
        ? 'Ouvrir le dashboard cible, confirmer visuellement la configuration, puis consigner la preuve.'
        : next.source === 'implementation'
          ? 'Faire la migration code avec idempotence et rollback, puis consigner la preuve apres observation.'
          : 'Lancer la lecture live ou l audit dedie, puis consigner la preuve si Vercel confirme l etat attendu.',
  }
}

async function getCompletionVerdictSummary(): Promise<CompletionVerdictSummary> {
  try {
    const [decisionsText, gatesText, completionText] = await Promise.all([
      fs.readFile(path.join(process.cwd(), 'config/vercel-pro-decisions.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'config/vercel-live-activation-gates.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'config/vercel-pro-completion-evidence.json'), 'utf8'),
    ])
    const decisions = JSON.parse(decisionsText) as { items?: ProDecisionItem[] }
    const gatesPlan = JSON.parse(gatesText) as { gates?: LiveActivationGate[] }
    const completion = JSON.parse(completionText) as { requirements?: CompletionRequirement[] }
    const decisionItems = Array.isArray(decisions.items) ? decisions.items : []
    const gates = Array.isArray(gatesPlan.gates) ? gatesPlan.gates : []
    const requirements = Array.isArray(completion.requirements) ? completion.requirements : []
    const decisionByKey = new Map(decisionItems.map((item) => [item.key, item]))
    const finalisedDecisions = decisionItems.filter((item) => item.status === 'active' || item.status === 'rejected').length
    const remainingGates = gates.filter((gate) => {
      const decision = decisionByKey.get(gate.decisionKey)
      return !decision || (decision.status !== 'active' && decision.status !== 'rejected')
    })
    const completeRequirements = requirements.filter((item) => item.status === 'complete').length
    const decisionScore = decisionItems.length > 0 ? finalisedDecisions / decisionItems.length : 0
    const gateScore = gates.length > 0 ? (gates.length - remainingGates.length) / gates.length : 0
    const proofScore = requirements.length > 0 ? completeRequirements / requirements.length : 0
    const score = Math.round(((decisionScore + gateScore + proofScore) / 3) * 100)
    const blockers = [
      finalisedDecisions < decisionItems.length ? `${decisionItems.length - finalisedDecisions} decision(s) Pro encore prepared/planned.` : null,
      remainingGates.length > 0 ? `${remainingGates.length} porte(s) live encore ouverte(s).` : null,
      completeRequirements < requirements.length ? `${requirements.length - completeRequirements} preuve(s) stricte(s) encore manquante(s).` : null,
    ].filter(Boolean) as string[]
    const ready = blockers.length === 0
    return {
      ready,
      score,
      tone: ready ? 'teal' : remainingGates.some((gate) => gate.status === 'requires-explicit-approval') ? 'danger' : 'gold',
      label: ready ? '100% prouvé' : '100% non prouvé',
      verdict: ready
        ? 'Vercel Pro est prouvable comme pleinement exploite: decisions finalisees, portes live fermees et preuves consignees.'
        : 'Vercel Pro est fortement prepare, mais pas encore declarable a 100% tant que les preuves live/dashboard manquent.',
      blockers,
      requiredCommand: 'npm run audit:vercel-pro-suite -- --strict --include-live',
    }
  } catch {
    return {
      ready: false,
      score: 0,
      tone: 'neutral',
      label: 'Verdict indisponible',
      verdict: 'Impossible de calculer le verdict 100% depuis les registres locaux.',
      blockers: ['Relire les fichiers config/vercel-*.json.'],
      requiredCommand: 'npm run audit:vercel-pro-suite -- --strict --include-live',
    }
  }
}

async function getDashboardLinksSummary(): Promise<DashboardLinksSummary> {
  const { teamId, projectId, teamBase } = await getLinkedVercelProject()
  try {
    return {
      teamId,
      projectId,
      links: [
        {
          key: 'project',
          label: 'Projet liveinblack',
          href: teamBase,
          purpose: projectId ? `Ouvrir le dashboard equipe pour retrouver le projet ${projectId}.` : 'Ouvrir le dashboard Vercel.',
        },
        {
          key: 'usage',
          label: 'Usage et couts',
          href: `${teamBase}/usage`,
          purpose: 'Suivre Edge Requests, data transfer, Functions, images, cache et couts Pro.',
        },
        {
          key: 'billing',
          label: 'Billing / Spend Management',
          href: `${teamBase}/~/settings/billing`,
          purpose: 'Verifier budgets, seuils 50/75/100 et alertes de depense.',
        },
        {
          key: 'firewall',
          label: 'Firewall / WAF',
          href: `${teamBase}/~/firewall`,
          purpose: 'Relire les regles stagees, observer les hits, puis publier quand le risque est clair.',
        },
        {
          key: 'webhooks',
          label: 'Webhooks plateforme',
          href: `${teamBase}/~/settings/webhooks`,
          purpose: 'Confirmer le webhook Account vers /api/ops/vercel-events et son secret.',
        },
        {
          key: 'drains',
          label: 'Log Drains',
          href: `${teamBase}/~/settings/log-drains`,
          purpose: 'Brancher ou verifier le drain seulement apres accord explicite.',
        },
        {
          key: 'edge-config',
          label: 'Edge Config',
          href: `${teamBase}/~/stores/edge-config`,
          purpose: 'Verifier les flags maintenance, checkout, revente, recherche et cache.',
        },
      ],
    }
  } catch {
    return {
      teamId: '',
      projectId: '',
      links: [
        {
          key: 'dashboard',
          label: 'Dashboard Vercel',
          href: 'https://vercel.com/dashboard',
          purpose: 'Ouvrir Vercel et selectionner le bon scope Pro.',
        },
      ],
    }
  }
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function buildItems(body: PatchBody) {
  const items: Array<{ operation: 'upsert'; key: string; value: boolean | number; configKey: ConfigKey }> = []
  if (typeof body.maintenanceMode === 'boolean') items.push({ operation: 'upsert', key: KEY_MAP.maintenanceMode, value: body.maintenanceMode, configKey: 'maintenanceMode' })
  if (typeof body.checkoutEnabled === 'boolean') items.push({ operation: 'upsert', key: KEY_MAP.checkoutEnabled, value: body.checkoutEnabled, configKey: 'checkoutEnabled' })
  if (typeof body.ticketResaleEnabled === 'boolean') items.push({ operation: 'upsert', key: KEY_MAP.ticketResaleEnabled, value: body.ticketResaleEnabled, configKey: 'ticketResaleEnabled' })
  if (body.searchMinQueryLength !== undefined) items.push({ operation: 'upsert', key: KEY_MAP.searchMinQueryLength, value: clampInteger(body.searchMinQueryLength, 2, 1, 8), configKey: 'searchMinQueryLength' })
  if (body.publicCacheTtlSeconds !== undefined) items.push({ operation: 'upsert', key: KEY_MAP.publicCacheTtlSeconds, value: clampInteger(body.publicCacheTtlSeconds, 45, 5, 300), configKey: 'publicCacheTtlSeconds' })
  return items
}

async function getRecentChanges() {
  await getDb()
  return VercelOpsConfigChange.find({})
    .sort({ changedAt: -1 })
    .limit(8)
    .lean()
    .then((changes) =>
      changes.map((change) => ({
        id: String(change._id),
        actorUserId: change.actorUserId,
        actorEmail: change.actorEmail,
        key: change.key,
        previousValue: change.previousValue,
        nextValue: change.nextValue,
        changedAt: change.changedAt,
      }))
    )
}

export async function GET() {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const config = await getVercelOpsConfig()
  const { writable } = writableState()
  const changes = await getRecentChanges()
  const proDecisions = await getProDecisionSummary()
  const usageWatchlist = await getUsageWatchlistSummary()
  const liveActivationGates = await getLiveActivationGatesSummary()
  const activationOrder = await getActivationOrderSummary()
  const completionEvidence = await getCompletionEvidenceSummary()
  const auditSuite = await getAuditSuiteSummary()
  const nextAction = await getNextActionSummary()
  const actionBlockers = await getActionBlockerSummary()
  const dashboardLinks = await getDashboardLinksSummary()
  const riskCost = await getRiskCostSummary()
  const completionVerdict = await getCompletionVerdictSummary()
  const liveEvidenceMatrix = await getLiveEvidenceMatrixSummary()
  const nextProofCapture = await getNextProofCaptureSummary()
  const proUtilizationMode = await getProUtilizationModeSummary()
  return NextResponse.json({ ok: true, config, writable, changes, opsStatus: opsStatus(), proDecisions, usageWatchlist, liveActivationGates, activationOrder, completionEvidence, auditSuite, nextAction, actionBlockers, dashboardLinks, riskCost, completionVerdict, liveEvidenceMatrix, nextProofCapture, proUtilizationMode })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { writable, token, teamId, edgeConfigId } = writableState()
  if (!writable) return NextResponse.json({ error: 'edge_config_write_not_configured' }, { status: 503 })

  const body = await req.json().catch(() => ({})) as PatchBody
  const items = buildItems(body)
  if (items.length === 0) return NextResponse.json({ error: 'empty_patch' }, { status: 400 })
  const before = await getVercelOpsConfig()

  const res = await fetch(`https://api.vercel.com/v1/edge-config/${edgeConfigId}/items?teamId=${teamId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items: items.map(({ operation, key, value }) => ({ operation, key, value })) }),
  })

  if (!res.ok) return NextResponse.json({ error: 'edge_config_update_failed' }, { status: 502 })
  await getDb()
  await VercelOpsConfigChange.insertMany(
    items
      .filter((item) => before[item.configKey] !== item.value)
      .map((item) => ({
        actorUserId: session.user.id,
        actorEmail: session.user.email || null,
        key: item.configKey,
        edgeConfigKey: item.key,
        previousValue: before[item.configKey],
        nextValue: item.value,
      })),
    { ordered: false }
  ).catch(() => null)

  clearVercelOpsConfigCache()
  const config = await getVercelOpsConfig()
  const changes = await getRecentChanges()
  const proDecisions = await getProDecisionSummary()
  const usageWatchlist = await getUsageWatchlistSummary()
  const liveActivationGates = await getLiveActivationGatesSummary()
  const activationOrder = await getActivationOrderSummary()
  const completionEvidence = await getCompletionEvidenceSummary()
  const auditSuite = await getAuditSuiteSummary()
  const nextAction = await getNextActionSummary()
  const actionBlockers = await getActionBlockerSummary()
  const dashboardLinks = await getDashboardLinksSummary()
  const riskCost = await getRiskCostSummary()
  const completionVerdict = await getCompletionVerdictSummary()
  const liveEvidenceMatrix = await getLiveEvidenceMatrixSummary()
  const nextProofCapture = await getNextProofCaptureSummary()
  const proUtilizationMode = await getProUtilizationModeSummary()
  return NextResponse.json({ ok: true, config, writable: true, changes, opsStatus: opsStatus(), proDecisions, usageWatchlist, liveActivationGates, activationOrder, completionEvidence, auditSuite, nextAction, actionBlockers, dashboardLinks, riskCost, completionVerdict, liveEvidenceMatrix, nextProofCapture, proUtilizationMode })
}
