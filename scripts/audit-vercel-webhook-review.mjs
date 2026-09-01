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

const review = readJson('config/vercel-account-webhook-review.json')
const setupScript = readText('scripts/setup-vercel-webhooks.mjs')
const route = readText('app/api/ops/vercel-events/route.ts')
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
  setupScript.includes('webhooks') &&
  setupScript.includes('--project') &&
  setupScript.includes('VERCEL_ACCOUNT_WEBHOOK_EVENTS') &&
  setupScript.includes('VERCEL_ACCOUNT_WEBHOOK_SECRET') &&
  route.includes('VERCEL_ACCOUNT_WEBHOOK_SECRET') &&
  route.includes('verifyVercelSignature') &&
  route.includes('RETENTION_DAYS = 90') &&
  agentClient.includes('Webhook plateforme')
const ready = codeReady && checks.length > 0 && completeChecks.length === checks.length

console.log(`Audit revue Webhook Vercel Account: ${ready ? 'prete' : 'incomplete'}`)
console.log(`Checklist: ${completeChecks.length}/${checks.length}`)
console.log(`Code endpoint/setup/agent: ${codeReady ? 'OK' : 'NON'}`)
console.log('')

for (const check of checks) {
  const complete = completeChecks.includes(check)
  console.log(`${complete ? 'OK ' : 'NON'} ${check.label || check.key} — ${check.howToVerify || 'Verification manquante'}`)
}

console.log('')
console.log(`Commande apply apres revue: ${review?.applyCommand || 'npm run ops:vercel:webhooks:setup -- --apply'}`)
console.log('Note: cet audit ne cree aucun webhook live; il verifie seulement que la revue est prete.')

if (!ready) {
  process.exitCode = 1
}
