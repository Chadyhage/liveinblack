import { spawn } from 'node:child_process'

const integrationTestUri = process.env.MONGODB_TEST_URI?.trim() || ''
const forwardedArgs = process.argv.slice(2)

if (!integrationTestUri) {
  console.warn('MONGODB_TEST_URI est absent, les tests d’intégration sont ignorés localement.')
  process.exit(0)
}

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', '--config', 'vitest.integration.config.ts', ...forwardedArgs],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      MONGODB_URI: process.env.MONGODB_URI?.trim() || integrationTestUri,
    },
  }
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
