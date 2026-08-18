#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const strictServices = process.env.STRICT_SERVICES === 'true'

function run(name, command, args = []) {
  console.log(`\n=== ${name} ===`)
  const res = spawnSync(command, args, { stdio: 'inherit', shell: true })
  return { name, code: res.status ?? 1 }
}

const services = run('services', 'npm', ['run', 'check:services'])
if (services.code !== 0 && strictServices) {
  console.error('Readiness arrêté: services manquants (STRICT_SERVICES=true)')
  process.exit(services.code)
}
if (services.code !== 0 && !strictServices) {
  console.warn('services check KO (non-bloquant ici), continuation readiness...')
}

const smoke = run('smoke', 'npm', ['run', 'ops:smoke'])
if (smoke.code !== 0) process.exit(smoke.code)

const load = run('load', 'npm', ['run', 'ops:load'])
process.exit(load.code)
