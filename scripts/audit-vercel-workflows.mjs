#!/usr/bin/env node

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

const workflowPlan = readJson('config/vercel-workflow-candidates.json')
const workflowReview = readJson('config/vercel-workflow-activation-review.json')
const vercel = readJson('vercel.json') ?? {}
const candidates = Array.isArray(workflowPlan?.candidates) ? workflowPlan.candidates : []
const reviewChecks = Array.isArray(workflowReview?.checks) ? workflowReview.checks : []
const cronPaths = new Set((Array.isArray(vercel.crons) ? vercel.crons : []).map((cron) => cron.path).filter(Boolean))
const completeCandidates = candidates.filter((candidate) =>
  candidate.key &&
  candidate.route &&
  candidate.priority &&
  candidate.target &&
  candidate.reason &&
  candidate.firstStep
)
const completeReviewChecks = reviewChecks.filter((check) =>
  check.key &&
  check.label &&
  typeof check.required === 'boolean' &&
  check.howToVerify &&
  check.riskIfMissing
)
const missingCronRoutes = candidates.filter((candidate) => candidate.route?.startsWith('/api/cron/') && !cronPaths.has(candidate.route))
const highPriority = candidates.filter((candidate) => candidate.priority === 'high')
const firstRecommendedBatch = Array.isArray(workflowReview?.firstRecommendedBatch) ? workflowReview.firstRecommendedBatch : []
const recommendedBatchReady = firstRecommendedBatch.length > 0 && firstRecommendedBatch.every((key) => candidates.some((candidate) => candidate.key === key))
const workflowReady =
  completeCandidates.length === candidates.length &&
  candidates.length > 0 &&
  missingCronRoutes.length === 0 &&
  completeReviewChecks.length === reviewChecks.length &&
  reviewChecks.length >= 6 &&
  recommendedBatchReady

console.log(`Audit Vercel Workflows/Queues: ${workflowReady ? 'pret' : 'incomplet'}`)
console.log(`Candidats documentes: ${completeCandidates.length}/${candidates.length}`)
console.log(`Priorite haute: ${highPriority.length}`)
console.log(`Checklist migration: ${completeReviewChecks.length}/${reviewChecks.length}`)
console.log(`Premier lot recommande: ${firstRecommendedBatch.length > 0 ? firstRecommendedBatch.join(', ') : 'non defini'}`)
console.log('')

for (const candidate of candidates) {
  const routeOk = !candidate.route?.startsWith('/api/cron/') || cronPaths.has(candidate.route)
  const complete = completeCandidates.includes(candidate)
  console.log(`${complete && routeOk ? 'OK ' : 'NON'} ${candidate.label || candidate.key} — ${candidate.priority}/${candidate.target}: ${candidate.firstStep || 'Action manquante'}`)
}

if (reviewChecks.length > 0) {
  console.log('')
  console.log('Revue avant premiere migration:')
  for (const check of reviewChecks) {
    const complete = completeReviewChecks.includes(check)
    console.log(`${complete ? 'OK ' : 'NON'} ${check.label || check.key} — ${check.howToVerify || 'Verification manquante'}`)
  }
}

if (missingCronRoutes.length > 0) {
  console.log('')
  console.log('Routes cron absentes de vercel.json:')
  for (const candidate of missingCronRoutes) {
    console.log(`- ${candidate.route}`)
  }
}

console.log('')
console.log('Prochaine action recommandee: migrer resale-expiry en premier, puis payouts apres observation, en gardant les crons comme declencheurs.')

if (!workflowReady) {
  process.exitCode = 1
}
