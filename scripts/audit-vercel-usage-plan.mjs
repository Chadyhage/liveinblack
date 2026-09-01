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

const usagePlan = readJson('config/vercel-usage-watchlist.json')
const items = Array.isArray(usagePlan?.items) ? usagePlan.items : []
const completeItems = items.filter((item) =>
  item.key &&
  item.label &&
  item.dashboard &&
  item.owner &&
  item.cadence &&
  item.healthySignal &&
  item.actionIfBad
)
const weeklyItems = items.filter((item) => item.cadence === 'weekly')
const owners = new Set(items.map((item) => item.owner).filter(Boolean))
const ready = items.length > 0 && completeItems.length === items.length && weeklyItems.length >= 6 && owners.size >= 3

console.log(`Audit Vercel Usage plan: ${ready ? 'pret' : 'incomplet'}`)
console.log(`Metriques suivies: ${completeItems.length}/${items.length}`)
console.log(`Owners couverts: ${owners.size}`)
console.log('')

for (const item of items) {
  const complete = completeItems.includes(item)
  console.log(`${complete ? 'OK ' : 'NON'} ${item.label || item.key} — ${item.dashboard || 'Dashboard manquant'}: ${item.actionIfBad || 'Action manquante'}`)
}

console.log('')
console.log('Rituel recommande: ouvrir Vercel Usage chaque semaine, comparer ces signaux, puis reporter les anomalies dans /agent/vercel.')

if (!ready) {
  process.exitCode = 1
}
