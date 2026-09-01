#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const apply = process.argv.includes('--apply')

const rules = [
  {
    name: 'LIB Log exploit probes',
    args: [
      'firewall',
      'rules',
      'add',
      'LIB Log exploit probes',
      '--condition',
      '{"type":"path","op":"inc","value":["/.env","/.git/config","/wp-admin","/phpmyadmin","/server-status"]}',
      '--action',
      'log',
      '--yes',
    ],
  },
  {
    name: 'LIB Log checkout pressure',
    args: [
      'firewall',
      'rules',
      'add',
      'LIB Log checkout pressure',
      '--condition',
      '{"type":"path","op":"pre","value":"/api/checkout"}',
      '--action',
      'rate_limit',
      '--rate-limit-window',
      '60',
      '--rate-limit-requests',
      '300',
      '--rate-limit-keys',
      'ip',
      '--rate-limit-action',
      'log',
      '--yes',
    ],
  },
  {
    name: 'LIB Log auth pressure',
    args: [
      'firewall',
      'rules',
      'add',
      'LIB Log auth pressure',
      '--condition',
      '{"type":"path","op":"pre","value":"/api/auth"}',
      '--action',
      'rate_limit',
      '--rate-limit-window',
      '60',
      '--rate-limit-requests',
      '120',
      '--rate-limit-keys',
      'ip',
      '--rate-limit-action',
      'log',
      '--yes',
    ],
  },
  {
    name: 'LIB Log search pressure',
    args: [
      'firewall',
      'rules',
      'add',
      'LIB Log search pressure',
      '--condition',
      '{"type":"path","op":"pre","value":"/api/search"}',
      '--action',
      'rate_limit',
      '--rate-limit-window',
      '60',
      '--rate-limit-requests',
      '600',
      '--rate-limit-keys',
      'ip',
      '--rate-limit-action',
      'log',
      '--yes',
    ],
  },
  {
    name: 'LIB Log webhook pressure',
    args: [
      'firewall',
      'rules',
      'add',
      'LIB Log webhook pressure',
      '--condition',
      '{"type":"path","op":"inc","value":["/api/webhooks/stripe","/api/webhooks/fedapay","/api/stripe-webhook"]}',
      '--action',
      'rate_limit',
      '--rate-limit-window',
      '60',
      '--rate-limit-requests',
      '240',
      '--rate-limit-keys',
      'ip',
      '--rate-limit-action',
      'log',
      '--yes',
    ],
  },
]

function runVercel(args) {
  const result = spawnSync('vercel', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  if (output) console.log(output)

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function readExistingRuleNames() {
  const result = spawnSync('vercel', ['firewall', 'rules', 'list', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  if (result.error || result.status !== 0) {
    if (output) console.warn(output)
    console.warn('Impossible de lire les regles existantes; le staging continue sans deduplication.')
    return new Set()
  }

  try {
    const parsed = JSON.parse(output)
    const list = Array.isArray(parsed) ? parsed : parsed.rules
    return new Set((Array.isArray(list) ? list : []).map((rule) => rule.name).filter(Boolean))
  } catch {
    console.warn('Sortie Firewall non JSON; le staging continue sans deduplication.')
    return new Set()
  }
}

if (!apply) {
  console.log('Dry-run: aucune regle Firewall Vercel ne sera creee.')
  console.log('Pour stage les regles en brouillon Vercel: npm run ops:vercel:firewall:stage -- --apply')
  console.log('Publication production separee apres revue: vercel firewall publish --yes')
  console.log('')
  for (const rule of rules) {
    console.log(`# ${rule.name}`)
    console.log(`vercel ${rule.args.map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(' ')}`)
    console.log('')
  }
  process.exit(0)
}

const existingRuleNames = readExistingRuleNames()

for (const rule of rules) {
  if (existingRuleNames.has(rule.name)) {
    console.log(`-> Deja present, ignore: ${rule.name}`)
    continue
  }
  console.log(`-> Staging Firewall: ${rule.name}`)
  runVercel(rule.args)
}

console.log('-> Diff Firewall brouillon')
runVercel(['firewall', 'diff'])
console.log('Regles stagees uniquement. Publier apres revue dashboard: vercel firewall publish --yes')
