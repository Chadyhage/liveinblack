#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const apply = process.argv.includes('--apply')
const publicOnly = process.argv.includes('--public-only')

const publicSafeKeys = new Set([
  'CLOUDINARY_PRIVATE_UPLOAD_PRESET',
  'CLOUDINARY_PUBLIC_UPLOAD_PRESET',
  'VAPID_SUBJECT',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'PUBLIC_SITE_URL',
  'EXPECTED_PUBLIC_SITE_HOST',
  'NEXT_PUBLIC_GA_MEASUREMENT_ID',
  'GOOGLE_SITE_VERIFICATION',
  'BING_SITE_VERIFICATION',
  'YANDEX_SITE_VERIFICATION',
  'PINTEREST_SITE_VERIFICATION',
])

const targetByKey = {
  MONGODB_TEST_URI: ['development'],
  VERCEL_LOGS_SINCE: [],
  VERCEL_AUTOMATION_BYPASS_SECRET: [],
  VERCEL_PROTECTION_BYPASS: [],
}

const defaultTargets = ['production', 'preview', 'development']

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
  } catch {
    return null
  }
}

function parseEnvFile(relativePath) {
  const absolute = path.join(root, relativePath)
  if (!fs.existsSync(absolute)) return new Map()

  const vars = new Map()
  for (const rawLine of fs.readFileSync(absolute, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    vars.set(key, value)
  }

  return vars
}

function getValue(key, vars, exampleVars) {
  const direct = vars.get(key)
  if (direct) return direct

  if (key === 'NEXT_PUBLIC_VAPID_PUBLIC_KEY') return vars.get('VAPID_PUBLIC_KEY') || ''
  if (key === 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY') return vars.get('VITE_STRIPE_PUBLISHABLE_KEY') || ''
  if (key === 'EXPECTED_PUBLIC_SITE_HOST') {
    const site = vars.get('PUBLIC_SITE_URL') || exampleVars.get('PUBLIC_SITE_URL') || ''
    try {
      return new URL(site).host
    } catch {
      return ''
    }
  }

  return publicSafeKeys.has(key) ? (exampleVars.get(key) || '') : ''
}

function run(command, args, input) {
  const result = spawnSync(command, args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  })

  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    code: result.status ?? 1,
  }
}

const linkedProject = readJson('.vercel/project.json')
if (!linkedProject?.orgId || !linkedProject?.projectId) {
  console.error('Projet Vercel non lie: .vercel/project.json est manquant ou incomplet.')
  process.exit(1)
}

const exampleVars = parseEnvFile('.env.example')
const localVars = parseEnvFile('.env.local')

if (localVars.size === 0) {
  console.error('.env.local absent ou vide. Aucun secret ne sera synchronise.')
  process.exit(1)
}

const operations = []
for (const key of exampleVars.keys()) {
  if (publicOnly && !publicSafeKeys.has(key)) continue
  const value = getValue(key, localVars, exampleVars)
  const targets = publicOnly ? ['production'] : (targetByKey[key] ?? defaultTargets)
  if (!targets.length) continue
  if (!value) continue
  operations.push({ key, value, targets })
}

if (!apply) {
  console.log('Dry-run: aucune variable Vercel ne sera creee.')
  console.log('Pour synchroniser les variables non sensibles: npm run ops:vercel:env:sync -- --public-only --apply')
  console.log('Pour synchroniser toutes les variables presentes dans .env.local: npm run ops:vercel:env:sync -- --apply')
  console.log('')
  for (const operation of operations) {
    console.log(`${operation.key} -> ${operation.targets.join(', ')}`)
  }
  process.exit(0)
}

for (const operation of operations) {
  for (const target of operation.targets) {
    console.log(`-> Sync ${operation.key} (${target})`)
    const args = ['env', 'add', operation.key, target, '--scope', linkedProject.orgId, '--yes']
    if (publicOnly) {
      args.push('--value', operation.value)
    }
    const result = run(
      'vercel',
      args,
      publicOnly ? undefined : `${operation.value}\n`
    )
    if (!result.ok) {
      const alreadyExists = /already exists|existe deja|conflict/i.test(result.output)
      if (alreadyExists) {
        console.log(`   deja presente (${target})`)
        continue
      }
      console.error(result.output || `exit ${result.code}`)
      process.exit(result.code)
    }
  }
}

console.log('Variables Vercel synchronisees. Relancer: npm run audit:vercel-env')
