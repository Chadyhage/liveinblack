#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const includeLive = process.argv.includes('--include-live')
const strict = process.argv.includes('--strict')

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

function runCommand(command) {
  const result = spawnSync(command, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  return {
    ok: result.status === 0,
    code: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  }
}

const suite = readJson('config/vercel-pro-audit-suite.json')
const commands = Array.isArray(suite?.commands) ? suite.commands : []
const pkg = readJson('package.json')
const packageScripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {}
const allowedScopes = new Set(['local', 'live-read'])
const allowedExpectedResults = new Set([
  'pass',
  'pass-after-live-access',
  'pass-after-live-actions',
  'fail-until-live-proof',
  'manual-input-tool',
])
const suiteScriptName = 'audit:vercel-pro-suite'
function npmScriptName(command) {
  const match = String(command || '').match(/^npm run ([^\s]+)(?:\s|$)/)
  return match?.[1] ?? null
}

function localNodeScriptPath(command) {
  const parts = String(command || '').trim().split(/\s+/)
  const nodeIndex = parts.indexOf('node')
  if (nodeIndex === -1) return null
  const scriptPath = parts.slice(nodeIndex + 1).find((part) => part.startsWith('scripts/'))
  return scriptPath ?? null
}

const seenKeys = new Set()
const duplicateKeys = new Set()
for (const item of commands) {
  if (!item.key) continue
  if (seenKeys.has(item.key)) duplicateKeys.add(item.key)
  seenKeys.add(item.key)
}
const missingScriptCommands = new Map()
const missingTargetFiles = new Map()
const invalidManualTools = new Map()
const missingManualApprovals = new Map()
const invalidScopeExpectations = new Map()
const suiteScriptNames = new Set()
for (const item of commands) {
  if (!item.command) continue
  const scriptName = npmScriptName(item.command)
  if (!scriptName) {
    missingScriptCommands.set(item.key || item.command, 'format')
  } else if (!packageScripts[scriptName]) {
    missingScriptCommands.set(item.key || item.command, scriptName)
  } else {
    suiteScriptNames.add(scriptName)
    if (item.expectedBeforeLiveComplete === 'manual-input-tool' && !scriptName.startsWith('ops:vercel:')) {
      invalidManualTools.set(item.key || item.command, scriptName)
    }
    if (item.expectedBeforeLiveComplete === 'manual-input-tool' && item.requiresExplicitApproval !== true) {
      missingManualApprovals.set(item.key || item.command, scriptName)
    }
    if (item.expectedBeforeLiveComplete === 'manual-input-tool' && !String(item.approvalReason || '').trim()) {
      missingManualApprovals.set(item.key || item.command, `${scriptName} sans raison`)
    }
    if (item.expectedBeforeLiveComplete === 'pass' && item.scope !== 'local') {
      invalidScopeExpectations.set(item.key || item.command, 'pass doit rester local')
    }
    if (['pass-after-live-access', 'pass-after-live-actions'].includes(item.expectedBeforeLiveComplete) && item.scope !== 'live-read') {
      invalidScopeExpectations.set(item.key || item.command, `${item.expectedBeforeLiveComplete} doit etre live-read`)
    }
    if (item.expectedBeforeLiveComplete === 'fail-until-live-proof' && scriptName !== 'audit:vercel-completion') {
      invalidScopeExpectations.set(item.key || item.command, 'fail-until-live-proof reserve a audit:vercel-completion')
    }
    const scriptPath = localNodeScriptPath(packageScripts[scriptName])
    if (scriptPath && !fs.existsSync(path.join(root, scriptPath))) {
      missingTargetFiles.set(item.key || item.command, scriptPath)
    }
  }
}
const vercelPackageScriptNames = Object.keys(packageScripts)
  .filter((scriptName) => (scriptName.startsWith('audit:vercel-') || scriptName.startsWith('ops:vercel:')) && scriptName !== suiteScriptName)
  .sort()
const scriptsMissingFromSuite = vercelPackageScriptNames.filter((scriptName) => !suiteScriptNames.has(scriptName))
const requiredProAreas = new Map([
  ['diagnostic-local', ['audit:vercel-pro']],
  ['variables-env', ['audit:vercel-env', 'ops:vercel:env:sync']],
  ['firewall', ['audit:vercel-firewall', 'ops:vercel:firewall:stage']],
  ['spend-management', ['audit:vercel-spend']],
  ['account-webhooks', ['audit:vercel-webhooks', 'ops:vercel:webhooks:setup']],
  ['log-drains', ['audit:vercel-drain', 'ops:vercel:drain:setup']],
  ['runtime-logs', ['ops:vercel:logs']],
  ['edge-config', ['ops:vercel:edge-config:setup', 'ops:vercel:edge-config:activate']],
  ['workflows-queues', ['audit:vercel-workflows']],
  ['usage-plan', ['audit:vercel-usage']],
  ['live-gates', ['audit:vercel-live-gates']],
  ['activation-order', ['audit:vercel-activation-order']],
  ['completion-proof', ['audit:vercel-completion', 'ops:vercel:evidence:record']],
  ['next-action', ['ops:vercel:next-action']],
  ['live-read', ['audit:vercel-live']],
])
const missingProAreas = [...requiredProAreas.entries()]
  .filter(([, scriptNames]) => scriptNames.some((scriptName) => !suiteScriptNames.has(scriptName)))
  .map(([area]) => area)
const selected = commands.filter((item) => includeLive || item.scope !== 'live-read')
let failed = scriptsMissingFromSuite.length + missingProAreas.length
let expectedPending = 0
let manualTools = 0
let executedAudits = 0

console.log(`Suite audit Vercel Pro: ${includeLive ? 'local + live-read' : 'local seulement'}`)
console.log(`Mode strict: ${strict ? 'oui' : 'non'}`)
for (const scriptName of scriptsMissingFromSuite) {
  console.log(`NON ${scriptName} — script Vercel absent de la suite 100%`)
}
for (const area of missingProAreas) {
  console.log(`NON ${area} — levier Vercel Pro absent de la suite 100%`)
}
console.log('')

for (const item of selected) {
  const missingScript = missingScriptCommands.get(item.key || item.command)
  const missingTargetFile = missingTargetFiles.get(item.key || item.command)
  const invalidManualTool = invalidManualTools.get(item.key || item.command)
  const missingManualApproval = missingManualApprovals.get(item.key || item.command)
  const invalidScopeExpectation = invalidScopeExpectations.get(item.key || item.command)
  if (!item.key || duplicateKeys.has(item.key) || missingScript || missingTargetFile || invalidManualTool || missingManualApproval || invalidScopeExpectation || !item.command || !item.label || item.requiredFor100 !== true || !allowedScopes.has(item.scope) || !allowedExpectedResults.has(item.expectedBeforeLiveComplete)) {
    failed += 1
    console.log(`NON ${item.key || 'commande'} — definition incomplete`)
    if (!item.key) console.log('   Cle commande manquante')
    if (duplicateKeys.has(item.key)) console.log(`   Cle commande dupliquee: ${item.key}`)
    if (missingScript === 'format') console.log(`   Commande npm run invalide: ${item.command}`)
    if (missingScript && missingScript !== 'format') console.log(`   Script package.json introuvable: ${missingScript}`)
    if (missingTargetFile) console.log(`   Fichier script introuvable: ${missingTargetFile}`)
    if (invalidManualTool) console.log(`   Outil manuel invalide: ${invalidManualTool} doit etre ops:vercel:*`)
    if (missingManualApproval) console.log(`   Approbation explicite ou raison manquante: ${missingManualApproval}`)
    if (invalidScopeExpectation) console.log(`   Coherence scope/comportement invalide: ${invalidScopeExpectation}`)
    if (item.requiredFor100 !== true) console.log('   requiredFor100 doit etre true')
    if (!allowedScopes.has(item.scope)) console.log(`   Scope invalide: ${item.scope || 'manquant'}`)
    if (!allowedExpectedResults.has(item.expectedBeforeLiveComplete)) console.log(`   Comportement attendu invalide: ${item.expectedBeforeLiveComplete || 'manquant'}`)
    continue
  }

  console.log(`> ${item.label}`)
  if (item.expectedBeforeLiveComplete === 'manual-input-tool') {
    manualTools += 1
    console.log(`MANUEL ${item.command} — outil disponible, a lancer avec les preuves et arguments explicites`)
    console.log(`   Raison approbation: ${item.approvalReason}`)
    console.log('')
    continue
  }

  executedAudits += 1
  const result = runCommand(item.command)
  const pendingExpected = item.expectedBeforeLiveComplete === 'fail-until-live-proof' && !strict
  if (result.ok) {
    console.log(`OK ${item.command}`)
  } else if (pendingExpected) {
    expectedPending += 1
    console.log(`ATTENDU ${item.command} — preuves live pas encore completes`)
  } else {
    failed += 1
    console.log(`NON ${item.command} — exit ${result.code}`)
  }

  const summaryLine = result.output.split(/\r?\n/).find((line) => line.trim())
  if (summaryLine) console.log(`   ${summaryLine}`)
  console.log('')
}

const skippedLive = commands.length - selected.length
const proofVerdict = failed > 0
  ? 'incomplete'
  : strict && includeLive && expectedPending === 0
    ? '100% prouve'
    : 'exploitable localement, preuves live non conclusives'
console.log(`Resultat suite: ${proofVerdict}`)
console.log(`Commandes selectionnees: ${selected.length}/${commands.length}`)
console.log(`Audits executes: ${executedAudits}/${commands.length}`)
console.log(`Live-read ignores: ${skippedLive}`)
console.log(`Echecs attendus hors strict: ${expectedPending}`)
console.log(`Outils manuels non lances: ${manualTools}`)
console.log(`Cles dupliquees: ${duplicateKeys.size}`)
console.log(`Commandes sans script package.json: ${missingScriptCommands.size}`)
console.log(`Scripts package.json sans fichier cible: ${missingTargetFiles.size}`)
console.log(`Scripts Vercel absents de la suite: ${scriptsMissingFromSuite.length}`)
console.log(`Outils manuels mal classes: ${invalidManualTools.size}`)
console.log(`Coherences scope/comportement invalides: ${invalidScopeExpectations.size}`)
console.log(`Leviers Vercel Pro absents: ${missingProAreas.length}`)
console.log(`Outils manuels sans approbation explicite: ${missingManualApprovals.size}`)

if (skippedLive > 0) {
  console.log('')
  console.log('Pour inclure les lectures Vercel live: npm run audit:vercel-pro-suite -- --include-live')
}

if (!strict) {
  console.log('Pour exiger le 100% prouve: npm run audit:vercel-pro-suite -- --strict --include-live')
}

if (failed > 0) {
  process.exitCode = 1
}
