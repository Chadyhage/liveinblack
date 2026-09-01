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

const review = readJson('config/vercel-drain-activation-review.json')
const setupScript = readText('scripts/setup-vercel-drain.mjs')
const route = readText('app/api/ops/vercel-drain/route.ts')
const agentClient = readText('app/components/features/agent/AgentVercelOpsClient.tsx')
const checks = Array.isArray(review?.checks) ? review.checks : []
const completeChecks = checks.filter((check) =>
  check.key &&
  check.label &&
  typeof check.required === 'boolean' &&
  check.howToVerify &&
  check.riskIfMissing
)
const codeReady =
  setupScript.includes('/v1/drains') &&
  setupScript.includes('VERCEL_DRAIN_URL') &&
  route.includes('DRAIN_SECRET') &&
  route.includes('verifyVercelSignature') &&
  route.includes('RETENTION_DAYS = 14') &&
  agentClient.includes('Log Drain')
const ready = codeReady && checks.length > 0 && completeChecks.length === checks.length

console.log(`Audit revue Log Drain Vercel: ${ready ? 'prete' : 'incomplete'}`)
console.log(`Checklist: ${completeChecks.length}/${checks.length}`)
console.log(`Code endpoint/setup/agent: ${codeReady ? 'OK' : 'NON'}`)
console.log('')

for (const check of checks) {
  const complete = completeChecks.includes(check)
  console.log(`${complete ? 'OK ' : 'NON'} ${check.label || check.key} — ${check.howToVerify || 'Verification manquante'}`)
}

console.log('')
console.log(`Commande apply apres accord explicite: ${review?.applyCommand || 'npm run ops:vercel:drain:setup -- --apply'}`)
console.log(`Approbation requise: ${review?.requiredApproval || 'Accord explicite avant export des logs runtime.'}`)
console.log('Note: cet audit ne cree aucun drain live; il verifie seulement que la revue est prete.')

if (!ready) {
  process.exitCode = 1
}
