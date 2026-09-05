import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function readText(relativePath) {
  try {
    return fs.readFileSync(path.join(root, relativePath), 'utf8')
  } catch {
    return ''
  }
}

function readJson(relativePath) {
  const text = readText(relativePath)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function walk(dir, predicate = () => true) {
  const absolute = path.join(root, dir)
  if (!fs.existsSync(absolute)) return []
  const out = []
  const stack = [absolute]
  while (stack.length) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (predicate(full)) {
        out.push(path.relative(root, full))
      }
    }
  }
  return out.sort()
}

function containsInFiles(files, pattern) {
  return files.some((file) => pattern.test(readText(file)))
}

const pkg = readJson('package.json') ?? {}
const vercel = readJson('vercel.json') ?? {}
const linkedProject = readJson('.vercel/project.json') ?? {}
const proDecisions = readJson('config/vercel-pro-decisions.json') ?? {}
const workflowCandidates = readJson('config/vercel-workflow-candidates.json') ?? {}
const workflowReview = readJson('config/vercel-workflow-activation-review.json') ?? {}
const usageWatchlist = readJson('config/vercel-usage-watchlist.json') ?? {}
const firewallReview = readJson('config/vercel-firewall-review.json') ?? {}
const spendReview = readJson('config/vercel-spend-management-review.json') ?? {}
const drainReview = readJson('config/vercel-drain-activation-review.json') ?? {}
const accountWebhookReview = readJson('config/vercel-account-webhook-review.json') ?? {}
const liveActivationGates = readJson('config/vercel-live-activation-gates.json') ?? {}
const activationOrder = readJson('config/vercel-pro-activation-order.json') ?? {}
const completionEvidence = readJson('config/vercel-pro-completion-evidence.json') ?? {}
const auditSuite = readJson('config/vercel-pro-audit-suite.json') ?? {}
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
const appAndLibFiles = walk('app', (file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file)).concat(
  walk('lib', (file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file)),
  ['next.config.ts', 'vercel.json', '.env.example', 'docs/ops/vercel-pro-activation.md'].filter((file) => readText(file))
)
const routeFiles = walk('app/api', (file) => file.endsWith('/route.ts') || file.endsWith('/route.js'))
const criticalObservedRoutes = [
  'app/api/checkout/route.ts',
  'app/api/webhooks/stripe/route.ts',
  'app/api/webhooks/fedapay/route.ts',
  'app/api/search/route.ts',
  'app/api/auth/register/route.ts',
  'app/api/auth/request-password-reset/route.ts',
]
const decisionItems = Array.isArray(proDecisions.items) ? proDecisions.items : []
const actionableDecisionItems = decisionItems.filter((item) => item?.status !== 'rejected')
const completeDecisionItems = decisionItems.filter((item) => item?.key && item?.label && item?.status && item?.evidence && item?.nextAction)
const activeOrRejectedDecisionItems = decisionItems.filter((item) => item?.status === 'active' || item?.status === 'rejected')
const workflowCandidateItems = Array.isArray(workflowCandidates.candidates) ? workflowCandidates.candidates : []
const workflowReviewChecks = Array.isArray(workflowReview.checks) ? workflowReview.checks : []
const usageWatchItems = Array.isArray(usageWatchlist.items) ? usageWatchlist.items : []
const firewallReviewRules = Array.isArray(firewallReview.rules) ? firewallReview.rules : []
const spendReviewChecks = Array.isArray(spendReview.checks) ? spendReview.checks : []
const drainReviewChecks = Array.isArray(drainReview.checks) ? drainReview.checks : []
const accountWebhookReviewChecks = Array.isArray(accountWebhookReview.checks) ? accountWebhookReview.checks : []
const liveActivationGateItems = Array.isArray(liveActivationGates.gates) ? liveActivationGates.gates : []
const activationOrderSteps = Array.isArray(activationOrder.steps) ? activationOrder.steps : []
const completionRequirements = Array.isArray(completionEvidence.requirements) ? completionEvidence.requirements : []
const auditSuiteCommands = Array.isArray(auditSuite.commands) ? auditSuite.commands : []

const checks = [
  {
    label: 'Projet Vercel lie',
    ok: Boolean(linkedProject.projectId && linkedProject.orgId),
    evidence: linkedProject.projectId ? `${linkedProject.projectId} / ${linkedProject.orgId}` : 'Aucun .vercel/project.json exploitable',
  },
  {
    label: 'Framework Next.js declare',
    ok: vercel.framework === 'nextjs',
    evidence: vercel.framework || 'Non declare',
  },
  {
    label: 'Regions configurees',
    ok: Array.isArray(vercel.regions) && vercel.regions.length > 0,
    evidence: Array.isArray(vercel.regions) ? vercel.regions.join(', ') : 'Aucune region',
  },
  {
    label: 'Web Analytics installe',
    ok: Boolean(deps['@vercel/analytics'] && containsInFiles(appAndLibFiles, /@vercel\/analytics/)),
    evidence: deps['@vercel/analytics'] || 'Absent',
  },
  {
    label: 'Speed Insights installe',
    ok: Boolean(deps['@vercel/speed-insights'] && containsInFiles(appAndLibFiles, /@vercel\/speed-insights/)),
    evidence: deps['@vercel/speed-insights'] || 'Absent',
  },
  {
    label: 'Events analytics business',
    ok: containsInFiles(appAndLibFiles, /\btrack\(/),
    evidence: containsInFiles(appAndLibFiles, /growthAnalytics/) ? 'growthAnalytics detecte' : 'Aucun tracking business detecte',
  },
  {
    label: 'Cron Jobs Vercel',
    ok: Array.isArray(vercel.crons) && vercel.crons.length > 0,
    evidence: `${Array.isArray(vercel.crons) ? vercel.crons.length : 0} cron(s)`,
  },
  {
    label: 'Logs structures sur Cron Jobs',
    ok: routeFiles.filter((file) => file.startsWith('app/api/cron/') && /runVercelCron/.test(readText(file))).length === (Array.isArray(vercel.crons) ? vercel.crons.length : 0),
    evidence: `${routeFiles.filter((file) => file.startsWith('app/api/cron/') && /runVercelCron/.test(readText(file))).length}/${Array.isArray(vercel.crons) ? vercel.crons.length : 0} cron(s) couverts`,
  },
  {
    label: 'Logs structures sur APIs critiques',
    ok: criticalObservedRoutes.every((file) => /runObservedRoute/.test(readText(file))),
    evidence: `${criticalObservedRoutes.filter((file) => /runObservedRoute/.test(readText(file))).length}/${criticalObservedRoutes.length} route(s) critiques couvertes`,
  },
  {
    label: 'Cache public / ISR',
    ok: containsInFiles(appAndLibFiles, /unstable_cache|revalidate|s-maxage|revalidateTag/),
    evidence: containsInFiles(appAndLibFiles, /unstable_cache/) ? 'unstable_cache + revalidation' : 'Cache partiel ou non detecte',
  },
  {
    label: 'Image Optimization',
    ok: /remotePatterns|images\s*:/.test(readText('next.config.ts')),
    evidence: /remotePatterns/.test(readText('next.config.ts')) ? 'remotePatterns configure' : 'Configuration image non detectee',
  },
  {
    label: 'Durees Functions critiques',
    ok: containsInFiles(routeFiles, /maxDuration\s*=\s*(60|120|300|800)/),
    evidence: `${routeFiles.filter((file) => /maxDuration/.test(readText(file))).length} route(s) avec maxDuration`,
  },
  {
    label: 'Travail post-reponse',
    ok: containsInFiles(appAndLibFiles, /\bafter\(|waitUntil/),
    evidence: containsInFiles(appAndLibFiles, /\bafter\(/) ? 'next/server after() detecte' : 'waitUntil/after non detecte',
  },
  {
    label: 'Plan Firewall/WAF',
    ok: /firewall/i.test(readText('docs/ops/vercel-pro-activation.md')) && Boolean(pkg.scripts?.['ops:vercel:firewall:stage']) && Boolean(pkg.scripts?.['audit:vercel-firewall']) && firewallReviewRules.length >= 5,
    evidence: pkg.scripts?.['ops:vercel:firewall:stage'] ? `Runbook + staging + revue ${firewallReviewRules.length} regle(s)` : 'Runbook sans script de staging',
  },
  {
    label: 'Scan logs post-deploy',
    ok: Boolean(pkg.scripts?.['ops:vercel:logs']) && /ops:vercel:logs/.test(readText('scripts/ops-deploy.mjs')),
    evidence: /ops:vercel:logs/.test(readText('scripts/ops-deploy.mjs')) ? 'Commande integree a ops:deploy:prod' : 'Commande non integree au deploy',
  },
  {
    label: 'Variables Ops Vercel documentees',
    ok: /VERCEL_AUTOMATION_BYPASS_SECRET/.test(readText('.env.example')) && /VERCEL_LOGS_SINCE/.test(readText('.env.example')) && /DRAIN_SECRET/.test(readText('.env.example')),
    evidence: 'Bypass, logs et drains dans .env.example',
  },
  {
    label: 'Signature Vercel centralisee',
    ok: readText('lib/server/vercelSignature.ts').includes('verifyVercelSignature') && containsInFiles(['app/api/ops/vercel-drain/route.ts', 'app/api/ops/vercel-spend/route.ts', 'app/api/ops/vercel-events/route.ts'], /verifyVercelSignature/),
    evidence: readText('lib/server/vercelSignature.ts') ? 'Helper HMAC commun pour drains/webhooks' : 'Helper signature absent',
  },
  {
    label: 'Audit live Vercel prepare',
    ok: Boolean(pkg.scripts?.['audit:vercel-live']) && readText('scripts/audit-vercel-live.mjs').includes('/v9/projects/') && readText('scripts/audit-vercel-live.mjs').includes('--scope') && readText('scripts/audit-vercel-live.mjs').includes('firewallDiff'),
    evidence: pkg.scripts?.['audit:vercel-live'] ? 'Commande audit:vercel-live disponible' : 'Commande absente',
  },
  {
    label: 'Audit/sync env Vercel prepares',
    ok: Boolean(pkg.scripts?.['audit:vercel-env']) && Boolean(pkg.scripts?.['ops:vercel:env:sync']),
    evidence: pkg.scripts?.['audit:vercel-env'] ? 'Audit env + sync dry-run disponibles' : 'Commandes env absentes',
  },
  {
    label: 'Setup drain observabilite prepare',
    ok: Boolean(pkg.scripts?.['ops:vercel:drain:setup']) && Boolean(pkg.scripts?.['audit:vercel-drain']) && readText('scripts/setup-vercel-drain.mjs').includes('VERCEL_DRAIN_URL') && drainReviewChecks.length >= 5,
    evidence: pkg.scripts?.['ops:vercel:drain:setup'] ? `Setup drain + revue ${drainReviewChecks.length} check(s)` : 'Commande drain absente',
  },
  {
    label: 'Plan Spend Management',
    ok: /Spend Management|budget|cout/i.test(readText('docs/ops/vercel-pro-activation.md')) && readText('app/api/ops/vercel-spend/route.ts').includes('VERCEL_SPEND_WEBHOOK_SECRET') && Boolean(pkg.scripts?.['audit:vercel-spend']) && spendReviewChecks.length >= 5,
    evidence: readText('app/api/ops/vercel-spend/route.ts') ? `Webhook spend signe + revue ${spendReviewChecks.length} check(s)` : 'Garde-fous cout documentes',
  },
  {
    label: 'Webhooks Vercel plateforme',
    ok: readText('app/api/ops/vercel-events/route.ts').includes('VERCEL_ACCOUNT_WEBHOOK_SECRET') && /webhook Vercel/i.test(readText('docs/ops/vercel-pro-activation.md')) && Boolean(pkg.scripts?.['audit:vercel-webhooks']) && accountWebhookReviewChecks.length >= 5,
    evidence: readText('app/api/ops/vercel-events/route.ts') ? `Endpoint signe + revue ${accountWebhookReviewChecks.length} check(s)` : 'Endpoint webhook plateforme absent',
  },
  {
    label: 'Lecture ops Vercel cote agent',
    ok: readText('app/api/agent/vercel/ops-events/route.ts').includes('requireAgent') && readText('app/(app)/agent/vercel/page.tsx').includes('AgentVercelOpsClient') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('/api/agent/vercel/ops-events') && readText('app/api/agent/vercel/ops-config/route.ts').includes('dashboardLinks') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Accès dashboard Vercel'),
    evidence: readText('app/(app)/agent/vercel/page.tsx') ? 'Page + API agent pour lire spend/platform/drain et ouvrir les raccourcis dashboard Vercel' : 'Lecture agent absente',
  },
  {
    label: 'Plan Edge Config / Flags',
    ok: /Edge Config|maintenance_mode|checkout_enabled/i.test(readText('docs/ops/vercel-pro-activation.md')) && Boolean(pkg.scripts?.['ops:vercel:edge-config:setup']) && Boolean(pkg.scripts?.['ops:vercel:edge-config:activate']),
    evidence: pkg.scripts?.['ops:vercel:edge-config:activate'] ? 'Runbook + setup + activation Edge Config' : 'Activation Edge Config absente',
  },
  {
    label: 'Edge Config consommee par le runtime',
    ok: containsInFiles(appAndLibFiles, /getVercelOpsConfig/) && /EDGE_CONFIG/.test(readText('.env.example')),
    evidence: containsInFiles(appAndLibFiles, /maintenanceMode|checkoutEnabled|ticketResaleEnabled/)
      ? 'Flags maintenance, checkout, revente, search/cache branches'
      : 'Helper Edge Config incomplet',
  },
  {
    label: 'Pilotage Edge Config cote agent',
    ok: readText('app/api/agent/vercel/ops-config/route.ts').includes('PATCH') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('/api/agent/vercel/ops-config') && readText('lib/models/VercelOpsConfigChange.ts').includes('actorUserId'),
    evidence: readText('lib/models/VercelOpsConfigChange.ts') ? 'Page agent peut lire/modifier les flags avec audit trail' : 'Pilotage Edge Config absent',
  },
  {
    label: 'Stockage Blob explicitement arbitre',
    ok: /Blob/i.test(readText('docs/ops/vercel-pro-activation.md')),
    evidence: deps['@vercel/blob'] ? '@vercel/blob installe' : 'Non installe, usage arbitre',
  },
  {
    label: 'Plan Workflows/Queues',
    ok: /Workflows|Queues/i.test(readText('docs/ops/vercel-pro-activation.md')) && workflowCandidateItems.length > 0 && workflowReviewChecks.length >= 6 && Boolean(pkg.scripts?.['audit:vercel-workflows']),
    evidence: `${workflowCandidateItems.length} candidat(s) + revue ${workflowReviewChecks.length} check(s)`,
  },
  {
    label: 'Plan Usage Vercel Pro',
    ok: usageWatchItems.length >= 6 && Boolean(pkg.scripts?.['audit:vercel-usage']) && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Suivi Usage Pro'),
    evidence: `${usageWatchItems.length} metrique(s) + audit dedie + affichage agent`,
  },
  {
    label: 'Registre decisions Vercel Pro',
    ok: decisionItems.length > 0 && completeDecisionItems.length === decisionItems.length,
    evidence: `${completeDecisionItems.length}/${decisionItems.length} decision(s) documentee(s)`,
  },
  {
    label: 'Portes activation live Vercel Pro',
    ok: liveActivationGateItems.length >= 5 && Boolean(pkg.scripts?.['audit:vercel-live-gates']) && readText('scripts/audit-vercel-live-gates.mjs').includes('allowedGateStatuses') && readText('scripts/audit-vercel-live-gates.mjs').includes('Portes avec statut invalide') && readText('app/api/agent/vercel/ops-config/route.ts').includes('remainingGates') && readText('app/api/agent/vercel/ops-config/route.ts').includes('getLiveEvidenceMatrixSummary') && readText('app/api/agent/vercel/ops-config/route.ts').includes('getNextProofCaptureSummary') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Portes live restantes') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Matrice des preuves live') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Prochaine preuve à capturer') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('fermée(s)'),
    evidence: `${liveActivationGateItems.length} porte(s) live reliees au 100%, filtrees par decisions et visibles agent avec matrice de preuves live, statuts controles et prochaine preuve a capturer`,
  },
  {
    label: 'Ordre activation 100% Vercel Pro',
    ok: activationOrderSteps.length >= liveActivationGateItems.length && Boolean(pkg.scripts?.['audit:vercel-activation-order']) && readText('scripts/audit-vercel-activation-order.mjs').includes('allowedAutomationLevels') && readText('scripts/audit-vercel-activation-order.mjs').includes('Etapes avec niveau automation invalide') && readText('app/api/agent/vercel/ops-config/route.ts').includes('remainingSteps') && readText('app/api/agent/vercel/ops-config/route.ts').includes('actionBlockers') && readText('app/api/agent/vercel/ops-config/route.ts').includes('getRiskCostSummary') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Ordre recommandé') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Blocages vers 100%') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Risque et coût restants') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('séquence restante'),
    evidence: `${activationOrderSteps.length} etape(s) ordonnees, filtrees et resumees par type de blocage, risque et cout, avec niveaux automation controles`,
  },
  {
    label: 'Preuves completion 100% Vercel Pro',
    ok: completionRequirements.length >= 5 && Boolean(pkg.scripts?.['audit:vercel-completion']) && Boolean(pkg.scripts?.['ops:vercel:evidence:record']) && readText('scripts/audit-vercel-completion.mjs').includes('allowedRequirementStatuses') && readText('scripts/audit-vercel-completion.mjs').includes('Statuts invalides') && readText('scripts/audit-vercel-completion.mjs').includes('incompleteFinalDecisions') && readText('scripts/audit-vercel-completion.mjs').includes('Decisions finales sans preuve exploitable') && readText('scripts/record-vercel-pro-evidence.mjs').includes('allowedDecisionStatuses') && readText('scripts/record-vercel-pro-evidence.mjs').includes('Status decision invalide') && readText('scripts/record-vercel-pro-evidence.mjs').includes('Preuve decision requise') && readText('scripts/record-vercel-pro-evidence.mjs').includes('confirmFinal') && readText('scripts/record-vercel-pro-evidence.mjs').includes('Confirmation finale requise') && readText('app/api/agent/vercel/ops-config/route.ts').includes('evidenceRecordCommand') && readText('app/api/agent/vercel/ops-config/route.ts').includes('completionStatus') && readText('app/api/agent/vercel/ops-config/route.ts').includes("completionStatus: 'pending-live'") && readText('app/api/agent/vercel/ops-config/route.ts').includes('--confirm-final') && readText('app/api/agent/vercel/ops-config/route.ts').includes('getCompletionVerdictSummary') && readText('app/api/agent/vercel/ops-config/route.ts').includes('getEvidenceFreshnessSummary') && readText('app/api/agent/vercel/ops-config/route.ts').includes('getProUtilizationModeSummary') && readText('app/api/agent/vercel/ops-config/route.ts').includes('getLiveActivationReadinessSummary') && readText('app/api/agent/vercel/ops-config/route.ts').includes('getProofDebtSummary') && readText('app/api/agent/vercel/ops-config/route.ts').includes('unavailable: true') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Preuves du 100%') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Verdict 100% Vercel Pro') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Fraîcheur des preuves') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Mode d’exploitation Vercel Pro') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Feu vert activation live') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Dette de preuve 100%') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('registre a relire') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Les registres locaux doivent etre relus') && readText('app/api/agent/vercel/ops-config/route.ts').includes('proofCommand') && readText('scripts/vercel-pro-next-action.mjs').includes('proofCommand') && readText('scripts/vercel-pro-next-action.mjs').includes('completionStatus') && readText('scripts/vercel-pro-next-action.mjs').includes("completionStatus: 'pending-live'") && readText('scripts/vercel-pro-next-action.mjs').includes('--confirm-final') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Commande preuve') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Copier') && readText('docs/ops/vercel-pro-activation.md').includes('registres locaux sont indisponibles'),
    evidence: `${completionRequirements.length} exigence(s) de preuve avant de declarer 100%, visibles agent avec verdict 100%, mode exploitation, feu vert activation live, dette de preuve 100%, etat registre indisponible, validation stricte des statuts, audit des decisions finales sans preuve, confirmation finale explicite, preuves partielles maintenues en pending-live, fraicheur preuves et commande de consignation copiable`,
  },
  {
    label: 'Suite audit 100% Vercel Pro',
    ok: auditSuiteCommands.length >= 10 && auditSuiteCommands.every((item) => item.requiredFor100 === true) && Boolean(pkg.scripts?.['audit:vercel-pro-suite']) && Boolean(pkg.scripts?.['ops:vercel:next-action']) && readText('scripts/audit-vercel-pro-suite.mjs').includes('requiredFor100 doit etre true') && readText('scripts/audit-vercel-pro-suite.mjs').includes('duplicateKeys') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Cle commande dupliquee') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Cles dupliquees') && readText('scripts/audit-vercel-pro-suite.mjs').includes('packageScripts') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Script package.json introuvable') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Fichier script introuvable') && readText('scripts/audit-vercel-pro-suite.mjs').includes('localNodeScriptPath') && readText('scripts/audit-vercel-pro-suite.mjs').includes('missingTargetFiles') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Scripts package.json sans fichier cible') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Commandes sans script package.json') && readText('scripts/audit-vercel-pro-suite.mjs').includes('vercelPackageScriptNames') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Scripts Vercel absents de la suite') && readText('scripts/audit-vercel-pro-suite.mjs').includes('script Vercel absent de la suite 100%') && readText('scripts/audit-vercel-pro-suite.mjs').includes('invalidManualTools') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Outil manuel invalide') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Outils manuels mal classes') && readText('scripts/audit-vercel-pro-suite.mjs').includes('missingManualApprovals') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Approbation explicite ou raison manquante') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Raison approbation') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Outils manuels sans approbation explicite') && auditSuiteCommands.filter((item) => item.expectedBeforeLiveComplete === 'manual-input-tool').every((item) => item.requiresExplicitApproval === true && String(item.approvalReason || '').trim()) && readText('scripts/audit-vercel-pro-suite.mjs').includes('invalidScopeExpectations') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Coherence scope/comportement invalide') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Coherences scope/comportement invalides') && readText('scripts/audit-vercel-pro-suite.mjs').includes('requiredProAreas') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Leviers Vercel Pro absents') && readText('scripts/audit-vercel-pro-suite.mjs').includes('levier Vercel Pro absent de la suite 100%') && readText('scripts/audit-vercel-pro-suite.mjs').includes('edge-config') && readText('scripts/audit-vercel-pro-suite.mjs').includes('runtime-logs') && readText('scripts/audit-vercel-pro-suite.mjs').includes('spend-management') && readText('scripts/audit-vercel-pro-suite.mjs').includes('allowedScopes') && readText('scripts/audit-vercel-pro-suite.mjs').includes('allowedExpectedResults') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Scope invalide') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Comportement attendu invalide') && readText('scripts/audit-vercel-pro-suite.mjs').includes('manual-input-tool') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Outils manuels non lances') && readText('scripts/audit-vercel-pro-suite.mjs').includes('executedAudits') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Commandes selectionnees') && readText('scripts/audit-vercel-pro-suite.mjs').includes('Audits executes') && readText('scripts/audit-vercel-pro-suite.mjs').includes('proofVerdict') && readText('scripts/audit-vercel-pro-suite.mjs').includes('100% prouve') && readText('scripts/audit-vercel-pro-suite.mjs').includes('preuves live non conclusives') && readText('scripts/vercel-pro-next-action.mjs').includes('Dette de preuve') && auditSuiteCommands.some((item) => item.scope === 'live-read') && auditSuiteCommands.some((item) => item.expectedBeforeLiveComplete === 'fail-until-live-proof') && readText('app/api/agent/vercel/ops-config/route.ts').includes('auditSuite') && readText('app/api/agent/vercel/ops-config/route.ts').includes('explicitApproval') && readText('app/api/agent/vercel/ops-config/route.ts').includes('requiresExplicitApproval') && readText('app/api/agent/vercel/ops-config/route.ts').includes('approvalReason') && readText('app/api/agent/vercel/ops-config/route.ts').includes('dashboardTargetForGate') && readText('app/api/agent/vercel/ops-config/route.ts').includes('safetyForAutomationLevel') && readText('app/api/agent/vercel/ops-config/route.ts').includes('buildPreflightChecklist') && readText('app/api/agent/vercel/ops-config/route.ts').includes('preflightChecklist') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Suite d’audit 100%') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('explicitApproval') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Approbation requise') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('approvalReason') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('validation humaine explicite') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Prochaine action recommandée') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('CommandLine') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Sécurité') && readText('app/components/features/agent/AgentVercelOpsClient.tsx').includes('Checklist avant action'),
    evidence: `${auditSuiteCommands.length} audit(s) orchestral(s), tous requis pour 100%, live optionnel, completion stricte, schema suite controle, cles suite uniques, scripts package.json et fichiers cibles controles separement, scripts Vercel couverts par la suite, leviers Vercel Pro obligatoires couverts, scopes coherents avec les comportements attendus, outils manuels reserves aux leviers ops:vercel avec approbation explicite et raison visible, outils manuels non lances a vide, compteurs selection/execution separes, verdict 100% reserve au strict live, prochaine action, checklist preflight, niveau securite, dashboard contextuel et commandes copiables visibles agent`,
  },
]

const passed = checks.filter((check) => check.ok).length
const score = Math.round((passed / checks.length) * 100)

console.log(`Diagnostic Vercel Pro local: ${score}% (${passed}/${checks.length})`)
console.log(`Routes API detectees: ${routeFiles.length}`)
console.log('')

for (const check of checks) {
  console.log(`${check.ok ? 'OK ' : 'NON'} ${check.label} — ${check.evidence}`)
}

console.log('')
if (decisionItems.length > 0) {
  const ready = activeOrRejectedDecisionItems.length
  const decisionScore = Math.round((ready / decisionItems.length) * 100)
  console.log(`Decisions Vercel Pro: ${decisionScore}% finalisees (${ready}/${decisionItems.length})`)
  for (const item of decisionItems) {
    const marker = item.status === 'active' || item.status === 'rejected' ? 'OK ' : 'NON'
    console.log(`${marker} ${item.label} — ${item.status}: ${item.nextAction}`)
  }
  const remaining = actionableDecisionItems.filter((item) => item.status !== 'active')
  if (remaining.length > 0) {
    console.log('')
    console.log('Actions restantes pour approcher le 100% reel:')
    for (const item of remaining) {
      console.log(`- ${item.label}: ${item.nextAction}`)
    }
  }
  console.log('')
}

console.log('A verifier dans Vercel Dashboard apres reconnexion au bon scope Pro:')
console.log('- Usage reel: Edge Requests, Fast Data Transfer, ISR, Functions, Fluid CPU/memory, Image Optimization.')
console.log('- Observabilite: Runtime logs, Web Analytics, Speed Insights, drains, retention, erreurs post-deploy.')
console.log('- Securite: Firewall rules en log, rate limits, IP blocks, system bypass, attack mode disponible.')
console.log('- Cout: Spend Management, alertes 50/75/100%, credits inclus, on-demand usage.')
console.log('- Environnements: production, preview, custom environment, deployment protection, bypass automation.')

if (score < 100) {
  process.exitCode = 1
}
