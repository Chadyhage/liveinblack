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

const review = readJson('config/vercel-spend-management-review.json')
const route = readText('app/api/ops/vercel-spend/route.ts')
const agentClient = readText('app/components/features/agent/AgentVercelOpsClient.tsx')
const envExample = readText('.env.example')
const checks = Array.isArray(review?.checks) ? review.checks : []
const completeChecks = checks.filter((check) =>
  check.key &&
  check.label &&
  typeof check.required === 'boolean' &&
  check.howToVerify &&
  check.riskIfMissing
)
const codeReady =
  route.includes('VERCEL_SPEND_WEBHOOK_SECRET') &&
  route.includes('VERCEL_SPEND_AUTO_MAINTENANCE') &&
  route.includes('verifyVercelSignature') &&
  agentClient.includes('Webhook budget') &&
  envExample.includes('VERCEL_SPEND_WEBHOOK_SECRET')
const reviewReady = checks.length > 0 && completeChecks.length === checks.length
const ready = codeReady && reviewReady

console.log(`Audit Spend Management Vercel: ${ready ? 'pret' : 'incomplet'}`)
console.log(`Checklist: ${completeChecks.length}/${checks.length}`)
console.log(`Code endpoint/agent/env: ${codeReady ? 'OK' : 'NON'}`)
console.log('')

for (const check of checks) {
  const complete = completeChecks.includes(check)
  console.log(`${complete ? 'OK ' : 'NON'} ${check.label || check.key} — ${check.howToVerify || 'Verification manquante'}`)
}

console.log('')
console.log(`Dashboard: ${review?.dashboard || 'Team Settings > Billing > Spend Management'}`)
console.log(`Endpoint: ${review?.endpoint || '/api/ops/vercel-spend'}`)
console.log(`Secret: ${review?.secretEnv || 'VERCEL_SPEND_WEBHOOK_SECRET'}`)
console.log('Note: cet audit ne prouve pas que Billing est configure live; il prouve que la revue et le code sont prets.')

if (!ready) {
  process.exitCode = 1
}
