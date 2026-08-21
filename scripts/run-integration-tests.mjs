import { spawn } from 'node:child_process'

const requireUri = process.argv.includes('--require-uri')
const integrationTestUri = process.env.MONGODB_TEST_URI?.trim() || ''
const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== '--require-uri')

if (!integrationTestUri) {
  const message = 'MONGODB_TEST_URI est absent.'
  if (requireUri) {
    console.error(`${message} Les tests d’intégration ne peuvent pas tourner dans ce mode strict.`)
    console.error('Exemple: MONGODB_TEST_URI=mongodb://127.0.0.1:27017/liveinblack_test npm run test:integration')
    process.exit(1)
  }

  console.warn(`${message} Les tests d’intégration sont ignorés localement (mode optionnel).`)
  process.exit(0)
}

if (!/test/i.test(integrationTestUri)) {
  console.error('MONGODB_TEST_URI doit pointer vers une base de test dédiée (son nom doit contenir "test").')
  process.exit(1)
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
