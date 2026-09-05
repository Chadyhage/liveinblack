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

const activationOrder = readJson('config/vercel-pro-activation-order.json')
const gatesPlan = readJson('config/vercel-live-activation-gates.json')
const steps = Array.isArray(activationOrder?.steps) ? activationOrder.steps : []
const gates = Array.isArray(gatesPlan?.gates) ? gatesPlan.gates : []
const gateKeys = new Set(gates.map((gate) => gate.key).filter(Boolean))
const allowedAutomationLevels = new Set([
  'manual-live-action',
  'manual-dashboard-action',
  'safe-apply-after-review',
  'requires-explicit-approval',
  'implementation-action',
])
const ranks = steps.map((step) => step.rank).filter((rank) => Number.isInteger(rank))
const completeSteps = steps.filter((step) =>
  Number.isInteger(step.rank) &&
  step.gateKey &&
  step.label &&
  step.owner &&
  allowedAutomationLevels.has(step.automationLevel) &&
  step.whyFirst &&
  step.preflight &&
  step.commandOrPlace &&
  step.doneWhen
)
const linkedSteps = steps.filter((step) => step.gateKey && gateKeys.has(step.gateKey))
const invalidAutomationSteps = steps.filter((step) => !allowedAutomationLevels.has(step.automationLevel))
const sorted = ranks.every((rank, index) => rank === index + 1)
const ready = steps.length > 0 && completeSteps.length === steps.length && linkedSteps.length === steps.length && invalidAutomationSteps.length === 0 && sorted

console.log(`Audit ordre activation Vercel Pro: ${ready ? 'pret' : 'incomplet'}`)
console.log(`Etapes documentees: ${completeSteps.length}/${steps.length}`)
console.log(`Etapes reliees aux portes live: ${linkedSteps.length}/${steps.length}`)
console.log(`Niveaux automation invalides: ${invalidAutomationSteps.length}`)
console.log(`Ordre continu: ${sorted ? 'OK' : 'NON'}`)
console.log('')

for (const step of steps.sort((a, b) => Number(a.rank) - Number(b.rank))) {
  const complete = completeSteps.includes(step)
  const linked = step.gateKey && gateKeys.has(step.gateKey)
  console.log(`${complete && linked ? 'OK ' : 'NON'} ${step.rank || '?'} — ${step.label || step.gateKey}`)
  console.log(`   Pourquoi: ${step.whyFirst || 'manquant'}`)
  console.log(`   Preflight: ${step.preflight || 'manquant'}`)
  console.log(`   Action: ${step.commandOrPlace || 'manquante'}`)
}

if (invalidAutomationSteps.length > 0) {
  console.log('')
  console.log('Etapes avec niveau automation invalide:')
  for (const step of invalidAutomationSteps) {
    console.log(`- ${step.rank || '?'} ${step.gateKey || 'sans-porte'}: ${step.automationLevel || 'niveau manquant'}`)
  }
}

console.log('')
console.log('Note: cet audit ne lance aucune activation live; il verifie seulement que l ordre de fermeture des portes est exploitable.')

if (!ready) {
  process.exitCode = 1
}
