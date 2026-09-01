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
const selected = commands.filter((item) => includeLive || item.scope !== 'live-read')
let failed = 0
let expectedPending = 0

console.log(`Suite audit Vercel Pro: ${includeLive ? 'local + live-read' : 'local seulement'}`)
console.log(`Mode strict: ${strict ? 'oui' : 'non'}`)
console.log('')

for (const item of selected) {
  if (!item.command || !item.label) {
    failed += 1
    console.log(`NON ${item.key || 'commande'} — definition incomplete`)
    continue
  }

  console.log(`> ${item.label}`)
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
console.log(`Resultat suite: ${failed === 0 ? 'exploitable' : 'incomplete'}`)
console.log(`Audits lances: ${selected.length}/${commands.length}`)
console.log(`Live-read ignores: ${skippedLive}`)
console.log(`Echecs attendus hors strict: ${expectedPending}`)

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
