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

function evidenceRecordCommand({ key, nextAction, decisionKey, completionStatus = 'complete' }) {
  const parts = [
    `npm run ops:vercel:evidence:record -- --key ${key}`,
    `--status ${completionStatus}`,
    '--evidence "preuve live observee"',
    `--next "${nextAction || 'Relancer audit:vercel-pro-suite -- --strict --include-live'}"`,
  ]
  if (completionStatus === 'complete') {
    parts.push('--confirm-final')
  }
  if (decisionKey) {
    parts.push(`--decision-key ${decisionKey}`)
    parts.push('--decision-status active')
    parts.push('--decision-evidence "preuve live observee"')
    parts.push('--decision-next "surveiller dans /agent/vercel"')
  }
  return parts.join(' ')
}

const order = readJson('config/vercel-pro-activation-order.json')
const gatesPlan = readJson('config/vercel-live-activation-gates.json')
const completion = readJson('config/vercel-pro-completion-evidence.json')
const decisions = readJson('config/vercel-pro-decisions.json')

const steps = Array.isArray(order?.steps) ? order.steps.slice().sort((a, b) => Number(a.rank) - Number(b.rank)) : []
const gates = Array.isArray(gatesPlan?.gates) ? gatesPlan.gates : []
const requirements = Array.isArray(completion?.requirements) ? completion.requirements : []
const decisionItems = Array.isArray(decisions?.items) ? decisions.items : []

const gateByKey = new Map(gates.map((gate) => [gate.key, gate]))
const decisionByKey = new Map(decisionItems.map((item) => [item.key, item]))
const openSteps = steps.filter((step) => {
  const gate = gateByKey.get(step.gateKey)
  const decision = gate ? decisionByKey.get(gate.decisionKey) : null
  return !decision || (decision.status !== 'active' && decision.status !== 'rejected')
})
const nextStep = openSteps[0]
const remainingDecisions = decisionItems.filter((item) => item.status !== 'active' && item.status !== 'rejected')
const remainingGates = gates.filter((gate) => {
  const decision = decisionByKey.get(gate.decisionKey)
  return !decision || (decision.status !== 'active' && decision.status !== 'rejected')
})
const missingRequirements = requirements.filter((item) => item.status !== 'complete')
const proofDebt = [
  ...remainingDecisions.map((item) => ({ label: item.label, source: 'decision', status: item.status, nextAction: item.nextAction, proofCommand: evidenceRecordCommand({ key: 'decisions-finalised', nextAction: item.nextAction, decisionKey: item.key, completionStatus: 'pending-live' }) })),
  ...remainingGates.map((gate) => ({ label: gate.label, source: 'porte live', status: gate.status, nextAction: gate.safeNextAction, proofCommand: evidenceRecordCommand({ key: 'live-gates-closed', nextAction: gate.safeNextAction, decisionKey: gate.decisionKey, completionStatus: 'pending-live' }) })),
  ...missingRequirements.map((item) => ({ label: item.label, source: 'preuve stricte', status: item.status, nextAction: item.nextAction, proofCommand: evidenceRecordCommand({ key: item.key, nextAction: item.nextAction }) })),
]
const completionScore = requirements.length > 0
  ? Math.round((requirements.filter((item) => item.status === 'complete').length / requirements.length) * 100)
  : 0

console.log(`Prochaine action Vercel Pro: ${nextStep ? nextStep.label : 'aucune action ouverte'}`)
console.log(`Preuves completion: ${completionScore}%`)
console.log(`Dette de preuve: ${proofDebt.length} item(s) ouvert(s) (${remainingDecisions.length} decision(s), ${remainingGates.length} porte(s), ${missingRequirements.length} preuve(s))`)
console.log('')

if (proofDebt.length > 0) {
  console.log('Dette de preuve 100%:')
  for (const item of proofDebt.slice(0, 8)) {
    console.log(`- [${item.source}] ${item.label} - ${item.status}: ${item.nextAction}`)
    if (item.proofCommand) console.log(`  preuve: ${item.proofCommand}`)
  }
  if (proofDebt.length > 8) console.log(`- ... ${proofDebt.length - 8} autre(s) item(s) a fermer`)
  console.log('')
}

if (!nextStep) {
  console.log('Toutes les etapes ordonnees semblent finalisees dans le registre decisions.')
  console.log('Prochaine verification: npm run audit:vercel-pro-suite -- --strict --include-live')
  process.exit(0)
}

const gate = gateByKey.get(nextStep.gateKey)
const decision = gate ? decisionByKey.get(gate.decisionKey) : null

console.log(`Rang: ${nextStep.rank}`)
console.log(`Responsable: ${nextStep.owner}`)
console.log(`Niveau: ${nextStep.automationLevel}`)
console.log(`Decision liee: ${gate?.decisionKey || 'inconnue'} (${decision?.status || 'absente'})`)
console.log('')
console.log(`Pourquoi maintenant: ${nextStep.whyFirst}`)
console.log(`Avant de lancer: ${nextStep.preflight}`)
console.log(`Action: ${nextStep.commandOrPlace}`)
console.log(`Termine quand: ${nextStep.doneWhen}`)

if (gate) {
  console.log('')
  console.log(`Preuve attendue: ${gate.evidenceRequired}`)
  console.log(`Risque si force: ${gate.riskIfForced}`)
}

console.log('')
console.log('Apres action live, consigner la preuve avec:')
console.log(`npm run ops:vercel:evidence:record -- --key live-gates-closed --status prepared --evidence "preuve observee pour ${nextStep.label}" --next "continuer avec la prochaine porte" --decision-key ${gate?.decisionKey || '<decision-key>'} --decision-status active --decision-evidence "preuve live observee" --decision-next "surveiller dans /agent/vercel"`)
