#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
  } catch {
    return null
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })

  return {
    ok: result.status === 0,
    code: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    error: result.error?.message,
  }
}

function parseJsonOutput(output) {
  const firstObject = output.indexOf('{')
  const firstArray = output.indexOf('[')
  const lastObject = output.lastIndexOf('}')
  const lastArray = output.lastIndexOf(']')
  const starts = [firstObject, firstArray].filter((index) => index >= 0)
  const start = starts.length > 0 ? Math.min(...starts) : -1
  const end = start === firstArray && lastArray > firstArray ? lastArray : lastObject
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(output.slice(start, end + 1))
    } catch {
      // Fall back to line candidates below.
    }
  }

  const candidates = output
    .split('\n')
    .map((line) => line.trim())
    .flatMap((line) => {
      const objectStart = line.indexOf('{')
      const arrayStart = line.indexOf('[')
      const starts = [objectStart, arrayStart].filter((index) => index >= 0)
      if (starts.length === 0) return []
      return [line.slice(Math.min(...starts))]
    })

  for (const candidate of candidates.reverse()) {
    try {
      return JSON.parse(candidate)
    } catch {
      // Keep looking: Vercel CLI can print non-JSON status lines before payloads.
    }
  }

  return null
}

function summarizeEndpoint(label, result, parser = (value) => value) {
  if (result.error) {
    return { label, ok: false, detail: result.error }
  }

  if (!result.ok) {
    const detail = firstUsefulLine(result.output) || `exit ${result.code}`
    return { label, ok: false, detail }
  }

  const parsed = parseJsonOutput(result.output)
  return { label, ok: true, detail: parser(parsed), parsed }
}

function firstUsefulLine(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !/^Vercel CLI /i.test(line) && !/^api is in beta/i.test(line))
}

function countArray(value, keys) {
  if (Array.isArray(value)) return value.length
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key].length
  }
  return 0
}

function getArray(value, keys) {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

const linkedProject = readJson('.vercel/project.json')
if (!linkedProject?.orgId || !linkedProject?.projectId) {
  console.error('Projet Vercel non lie: .vercel/project.json est manquant ou incomplet.')
  process.exit(1)
}

const teamId = linkedProject.orgId
const projectId = linkedProject.projectId
const scope = ['--scope', teamId]

const checks = [
  summarizeEndpoint(
    'Projet',
    run('vercel', ['api', `/v9/projects/${projectId}`, ...scope, '--raw']),
    (value) => value?.name || value?.id || 'Projet accessible'
  ),
  summarizeEndpoint(
    'Variables environnement',
    run('vercel', ['api', `/v9/projects/${projectId}/env`, ...scope, '--raw']),
    (value) => `${countArray(value, ['envs', 'env'])} variable(s)`
  ),
  summarizeEndpoint(
    'Deployments recents',
    run('vercel', ['api', `/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5`, ...scope, '--raw']),
    (value) => `${countArray(value, ['deployments'])} deployment(s)`
  ),
  summarizeEndpoint(
    'Domaines',
    run('vercel', ['api', `/v9/projects/${projectId}/domains`, ...scope, '--raw']),
    (value) => `${countArray(value, ['domains'])} domaine(s)`
  ),
  summarizeEndpoint(
    'Drains observabilite',
    run('vercel', ['api', '/v1/drains', ...scope, '--raw']),
    (value) => `${countArray(value, ['drains'])} drain(s)`
  ),
  summarizeEndpoint(
    'Edge Config',
    run('vercel', ['edge-config', 'list', ...scope, '--format', 'json']),
    (value) => `${countArray(value, ['items', 'edgeConfigs'])} config(s)`
  ),
  summarizeEndpoint(
    'Account webhooks',
    run('vercel', ['webhooks', 'ls', ...scope, '--format', 'json']),
    (value) => `${countArray(value, ['webhooks', 'hooks', 'items', 'data'])} webhook(s)`
  ),
]
const firewallDiff = run('vercel', ['firewall', 'diff'])
const firewallDraftCount = firewallDiff.ok ? (firewallDiff.output.match(/^\s*\+ Added rule/mg) ?? []).length : 0

const passed = checks.filter((check) => check.ok).length
const envs = getArray(checks.find((check) => check.label === 'Variables environnement')?.parsed, ['envs', 'env'])
const deployments = getArray(checks.find((check) => check.label === 'Deployments recents')?.parsed, ['deployments'])
const domains = getArray(checks.find((check) => check.label === 'Domaines')?.parsed, ['domains'])
const drains = getArray(checks.find((check) => check.label === 'Drains observabilite')?.parsed, ['drains'])
const edgeConfigs = getArray(checks.find((check) => check.label === 'Edge Config')?.parsed, ['items', 'edgeConfigs'])
const webhooks = getArray(checks.find((check) => check.label === 'Account webhooks')?.parsed, ['webhooks', 'hooks', 'items', 'data'])
const platformWebhookConfigured = webhooks.some((webhook) => typeof webhook?.url === 'string' && webhook.url.includes('/api/ops/vercel-events'))
const configuredChecks = [
  { label: 'Env vars configurees', ok: envs.length > 0, detail: `${envs.length} variable(s)` },
  { label: 'Deployment recent visible', ok: deployments.length > 0, detail: `${deployments.length} deployment(s)` },
  { label: 'Domaine production configure', ok: domains.length > 0, detail: `${domains.length} domaine(s)` },
  { label: 'Firewall draft stage', ok: firewallDraftCount > 0, detail: `${firewallDraftCount} changement(s) brouillon` },
  { label: 'Drain observabilite configure', ok: drains.length > 0, detail: `${drains.length} drain(s)` },
  { label: 'Edge Config configure', ok: edgeConfigs.length > 0, detail: `${edgeConfigs.length} config(s)` },
  { label: 'Webhook plateforme configure', ok: platformWebhookConfigured, detail: `${webhooks.length} webhook(s)` },
]
const configuredPassed = configuredChecks.filter((check) => check.ok).length

console.log(`Audit Vercel live: ${passed}/${checks.length} endpoint(s) accessibles`)
console.log(`Configuration live: ${configuredPassed}/${configuredChecks.length} brique(s) configuree(s)`)
console.log(`Projet lie: ${projectId}`)
console.log(`Team liee: ${teamId}`)
console.log('')

for (const check of checks) {
  console.log(`${check.ok ? 'OK ' : 'NON'} ${check.label} — ${String(check.detail).split('\n')[0]}`)
}

console.log('')
for (const check of configuredChecks) {
  console.log(`${check.ok ? 'OK ' : 'NON'} ${check.label} — ${check.detail}`)
}

if (passed !== checks.length || configuredPassed !== configuredChecks.length) {
  console.log('')
  if (passed !== checks.length) {
    console.log('Action requise: verifier le scope Vercel CLI/Codex et relancer `npm run audit:vercel-live`.')
  }
  if (configuredPassed !== configuredChecks.length) {
    console.log('Action requise: completer la configuration Vercel Dashboard manquante, puis relancer `npm run audit:vercel-live`.')
  }
  if (firewallDraftCount > 0) {
    console.log('Firewall: les regles sont en brouillon. Publier seulement apres revue dashboard: `vercel firewall publish --yes`.')
  }
  process.exit(1)
}
