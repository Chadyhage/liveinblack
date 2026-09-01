#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const evidencePath = path.join(root, 'config/vercel-pro-completion-evidence.json')
const decisionsPath = path.join(root, 'config/vercel-pro-decisions.json')
const allowedStatuses = new Set(['pending-live', 'prepared', 'complete'])
const allowedDecisionStatuses = new Set(['planned', 'prepared', 'active', 'rejected'])

function usage() {
  console.log('Usage:')
  console.log('  npm run ops:vercel:evidence:record -- --key <requirement-key> --status <pending-live|prepared|complete> --evidence "preuve actuelle" --next "prochaine action"')
  console.log('  Ajouter --confirm-final quand --status complete est utilise.')
  console.log('  Option decision: --decision-key <decision-key> --decision-status <planned|prepared|active|rejected> --decision-evidence "preuve decision" --decision-next "prochaine action decision"')
  console.log('')
  console.log('Exemple:')
  console.log('  npm run ops:vercel:evidence:record -- --key live-gates-closed --status complete --confirm-final --evidence "Firewall publie, Spend Management actif, webhook/drain confirmes, workflow resale-expiry migre." --next "Relancer audit:vercel-pro-suite -- --strict --include-live"')
}

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return ''
  return process.argv[index + 1] || ''
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const key = argValue('key').trim()
const status = argValue('status').trim()
const currentEvidence = argValue('evidence').trim()
const nextAction = argValue('next').trim()
const decisionKey = argValue('decision-key').trim()
const decisionStatus = argValue('decision-status').trim()
const decisionEvidence = argValue('decision-evidence').trim()
const decisionNext = argValue('decision-next').trim()
const confirmFinal = process.argv.includes('--confirm-final')

if (!key || !status || !currentEvidence || !nextAction || !allowedStatuses.has(status)) {
  usage()
  process.exit(1)
}

if (status === 'complete' && !confirmFinal) {
  console.error('Confirmation finale requise: ajouter --confirm-final pour passer une preuve en complete.')
  process.exit(1)
}

const completion = readJson(evidencePath)
const requirements = Array.isArray(completion.requirements) ? completion.requirements : []
const requirement = requirements.find((item) => item.key === key)
let decisions = null
let decision = null

if (!requirement) {
  console.error(`Exigence introuvable: ${key}`)
  console.error(`Cles disponibles: ${requirements.map((item) => item.key).join(', ')}`)
  process.exit(1)
}

if (decisionStatus && !allowedDecisionStatuses.has(decisionStatus)) {
  console.error(`Status decision invalide: ${decisionStatus}`)
  console.error(`Statuses decision autorises: ${Array.from(allowedDecisionStatuses).join(', ')}`)
  process.exit(1)
}

if ((decisionStatus === 'active' || decisionStatus === 'rejected') && (!decisionEvidence || !decisionNext)) {
  console.error('Preuve decision requise: --decision-evidence et --decision-next sont obligatoires pour active/rejected.')
  process.exit(1)
}

if (decisionKey) {
  decisions = readJson(decisionsPath)
  const items = Array.isArray(decisions.items) ? decisions.items : []
  decision = items.find((item) => item.key === decisionKey)
  if (!decision) {
    console.error(`Decision introuvable: ${decisionKey}`)
    console.error(`Cles disponibles: ${items.map((item) => item.key).join(', ')}`)
    process.exit(1)
  }
}

requirement.status = status
requirement.currentEvidence = currentEvidence
requirement.nextAction = nextAction
completion.updatedAt = new Date().toISOString().slice(0, 10)
writeJson(evidencePath, completion)

if (decisionKey && decisions && decision) {
  if (decisionStatus) decision.status = decisionStatus
  if (decisionEvidence) decision.evidence = decisionEvidence
  if (decisionNext) decision.nextAction = decisionNext
  decisions.updatedAt = completion.updatedAt
  writeJson(decisionsPath, decisions)
}

console.log(`Preuve Vercel Pro mise a jour: ${key} -> ${status}`)
if (decisionKey) console.log(`Decision Vercel Pro mise a jour: ${decisionKey}`)
