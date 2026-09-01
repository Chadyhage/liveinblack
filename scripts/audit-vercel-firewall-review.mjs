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

const review = readJson('config/vercel-firewall-review.json')
const stageScript = readText('scripts/stage-vercel-firewall.mjs')
const rules = Array.isArray(review?.rules) ? review.rules : []
const completeRules = rules.filter((rule) =>
  rule.name &&
  rule.risk &&
  rule.expectedAction &&
  rule.expectedMatch &&
  rule.reviewChecklist
)
const stagedRules = rules.filter((rule) => stageScript.includes(rule.name))
const mediumOrHigher = rules.filter((rule) => rule.risk !== 'low')
const ready = rules.length > 0 && completeRules.length === rules.length && stagedRules.length === rules.length && review?.publishCommand === 'vercel firewall publish --yes'

console.log(`Audit revue Firewall Vercel: ${ready ? 'prete' : 'incomplete'}`)
console.log(`Regles documentees: ${completeRules.length}/${rules.length}`)
console.log(`Regles presentes dans le staging: ${stagedRules.length}/${rules.length}`)
console.log(`Regles a risque moyen ou plus: ${mediumOrHigher.length}`)
console.log('')

for (const rule of rules) {
  const ok = completeRules.includes(rule) && stagedRules.includes(rule)
  console.log(`${ok ? 'OK ' : 'NON'} ${rule.name} — ${rule.risk}: ${rule.reviewChecklist}`)
}

console.log('')
console.log(`Revue avant publication: ${review?.reviewCommand || 'vercel firewall diff'}`)
console.log(`Publication humaine explicite: ${review?.publishCommand || 'vercel firewall publish --yes'}`)

if (!ready) {
  process.exitCode = 1
}
