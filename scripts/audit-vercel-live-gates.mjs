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

const gatePlan = readJson('config/vercel-live-activation-gates.json')
const decisions = readJson('config/vercel-pro-decisions.json')
const gates = Array.isArray(gatePlan?.gates) ? gatePlan.gates : []
const decisionItems = Array.isArray(decisions?.items) ? decisions.items : []
const decisionKeys = new Set(decisionItems.map((item) => item.key).filter(Boolean))
const allowedGateStatuses = new Set([
  'manual-live-action',
  'manual-dashboard-action',
  'safe-apply-after-review',
  'requires-explicit-approval',
  'implementation-action',
])
const completeGates = gates.filter((gate) =>
  gate.key &&
  gate.label &&
  gate.decisionKey &&
  allowedGateStatuses.has(gate.status) &&
  gate.evidenceRequired &&
  gate.safeNextAction &&
  gate.riskIfForced
)
const linkedGates = gates.filter((gate) => gate.decisionKey && decisionKeys.has(gate.decisionKey))
const invalidStatusGates = gates.filter((gate) => !allowedGateStatuses.has(gate.status))
const ready = gates.length > 0 && completeGates.length === gates.length && linkedGates.length === gates.length && invalidStatusGates.length === 0

console.log(`Audit portes live Vercel Pro: ${ready ? 'pret' : 'incomplet'}`)
console.log(`Portes documentees: ${completeGates.length}/${gates.length}`)
console.log(`Portes reliees au registre decisions: ${linkedGates.length}/${gates.length}`)
console.log(`Statuts portes invalides: ${invalidStatusGates.length}`)
console.log('')

for (const gate of gates) {
  const complete = completeGates.includes(gate)
  const linked = gate.decisionKey && decisionKeys.has(gate.decisionKey)
  console.log(`${complete && linked ? 'OK ' : 'NON'} ${gate.label || gate.key} — ${gate.status || 'status manquant'}`)
  console.log(`   Preuve attendue: ${gate.evidenceRequired || 'manquante'}`)
  console.log(`   Action sure: ${gate.safeNextAction || 'manquante'}`)
}

if (invalidStatusGates.length > 0) {
  console.log('')
  console.log('Portes avec statut invalide:')
  for (const gate of invalidStatusGates) {
    console.log(`- ${gate.key || 'sans-cle'}: ${gate.status || 'status manquant'}`)
  }
}

console.log('')
console.log('Note: cet audit ne prouve pas que les actions live sont faites; il verifie que les dernieres portes sont explicites et reliees au diagnostic Pro.')

if (!ready) {
  process.exitCode = 1
}
