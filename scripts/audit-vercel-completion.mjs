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

const completion = readJson('config/vercel-pro-completion-evidence.json')
const decisions = readJson('config/vercel-pro-decisions.json')
const gates = readJson('config/vercel-live-activation-gates.json')
const order = readJson('config/vercel-pro-activation-order.json')
const pkg = readJson('package.json') ?? {}
const allowedRequirementStatuses = new Set(['pending-live', 'prepared', 'complete'])
const allowedDecisionStatuses = new Set(['planned', 'prepared', 'active', 'rejected'])

const requirements = Array.isArray(completion?.requirements) ? completion.requirements : []
const decisionItems = Array.isArray(decisions?.items) ? decisions.items : []
const gateItems = Array.isArray(gates?.gates) ? gates.gates : []
const orderSteps = Array.isArray(order?.steps) ? order.steps : []
const scripts = pkg.scripts ?? {}
const requiredScripts = [
  'audit:vercel-pro',
  'audit:vercel-live',
  'audit:vercel-env',
  'audit:vercel-firewall',
  'audit:vercel-spend',
  'audit:vercel-webhooks',
  'audit:vercel-drain',
  'audit:vercel-workflows',
  'audit:vercel-usage',
  'audit:vercel-live-gates',
  'audit:vercel-activation-order',
  'audit:vercel-completion',
  'ops:vercel:evidence:record',
  'ops:vercel:next-action',
]

const completeRequirements = requirements.filter((item) =>
  item.key &&
  item.label &&
  allowedRequirementStatuses.has(item.status) &&
  item.evidenceSource &&
  item.evidenceRequired &&
  item.currentEvidence &&
  item.nextAction
)
const invalidRequirements = requirements.filter((item) => !allowedRequirementStatuses.has(item.status))
const invalidDecisions = decisionItems.filter((item) => !allowedDecisionStatuses.has(item.status))
const finalisedDecisions = decisionItems.filter((item) => item.status === 'active' || item.status === 'rejected')
const incompleteFinalDecisions = finalisedDecisions.filter((item) => !item.evidence || !item.nextAction)
const allScriptsPresent = requiredScripts.every((script) => Boolean(scripts[script]))
const gatesCoveredByOrder = gateItems.length > 0 && gateItems.every((gate) => orderSteps.some((step) => step.gateKey === gate.key))
const prepared =
  requirements.length > 0 &&
  completeRequirements.length === requirements.length &&
  invalidRequirements.length === 0 &&
  invalidDecisions.length === 0 &&
  incompleteFinalDecisions.length === 0 &&
  gateItems.length >= 5 &&
  orderSteps.length >= gateItems.length &&
  gatesCoveredByOrder &&
  allScriptsPresent
const liveComplete =
  prepared &&
  decisionItems.length > 0 &&
  finalisedDecisions.length === decisionItems.length &&
  requirements.every((item) => item.status === 'complete')

console.log(`Audit completion Vercel Pro: ${liveComplete ? '100% prouve' : prepared ? 'preuves preparees, live incomplet' : 'incomplet'}`)
console.log(`Exigences documentees: ${completeRequirements.length}/${requirements.length}`)
console.log(`Decisions finalisees: ${finalisedDecisions.length}/${decisionItems.length}`)
console.log(`Portes live couvertes par ordre: ${gatesCoveredByOrder ? 'OK' : 'NON'}`)
console.log(`Audits disponibles: ${requiredScripts.filter((script) => Boolean(scripts[script])).length}/${requiredScripts.length}`)
console.log(`Statuts invalides: ${invalidRequirements.length + invalidDecisions.length}`)
console.log(`Decisions finales sans preuve: ${incompleteFinalDecisions.length}`)
console.log('')

for (const requirement of requirements) {
  console.log(`${requirement.status === 'complete' ? 'OK ' : 'NON'} ${requirement.label || requirement.key} — ${requirement.status || 'status manquant'}`)
  console.log(`   Preuve requise: ${requirement.evidenceRequired || 'manquante'}`)
  console.log(`   Preuve actuelle: ${requirement.currentEvidence || 'manquante'}`)
}

if (!allScriptsPresent) {
  console.log('')
  console.log('Audits manquants:')
  for (const script of requiredScripts.filter((name) => !scripts[name])) {
    console.log(`- ${script}`)
  }
}

if (invalidRequirements.length > 0 || invalidDecisions.length > 0) {
  console.log('')
  console.log('Statuts invalides:')
  for (const item of invalidRequirements) {
    console.log(`- exigence ${item.key || 'sans-cle'}: ${item.status || 'status manquant'}`)
  }
  for (const item of invalidDecisions) {
    console.log(`- decision ${item.key || 'sans-cle'}: ${item.status || 'status manquant'}`)
  }
}

if (incompleteFinalDecisions.length > 0) {
  console.log('')
  console.log('Decisions finales sans preuve exploitable:')
  for (const item of incompleteFinalDecisions) {
    console.log(`- ${item.key || 'sans-cle'}: evidence=${item.evidence ? 'OK' : 'manquante'}, nextAction=${item.nextAction ? 'OK' : 'manquante'}`)
  }
}

console.log('')
console.log('Note: cet audit est volontairement strict. Tant que des preuves live/dashboard manquent, il refuse de declarer le 100%.')

if (!liveComplete) {
  process.exitCode = 1
}
