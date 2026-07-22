import { defineConfig } from 'vitest/config'

const integrationTestUri = process.env.MONGODB_TEST_URI?.trim() || ''
const integrationTestsEnabled = Boolean(integrationTestUri)

if (integrationTestsEnabled) {
  const databaseName = integrationTestUri.split('?')[0]?.split('/').pop() || ''
  if (!databaseName.toLowerCase().includes('test')) {
    throw new Error('MONGODB_TEST_URI doit cibler une base dont le nom contient "test".')
  }

  // Les fichiers historiques lisent MONGODB_URI. On ne leur transmet que la
  // base explicitement réservée aux tests, jamais la connexion applicative.
  process.env.MONGODB_URI = integrationTestUri
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/old/**',
      ...(!integrationTestsEnabled ? ['**/*.integration.test.ts'] : []),
    ],
    // Les tests d'intégration (*.integration.test.ts) partagent une vraie base
    // MongoDB via MONGODB_TEST_URI (transactions réelles obligent) — leurs
    // beforeEach purgent les mêmes collections. En parallèle (comportement
    // par défaut de Vitest), un fichier peut vider la base pendant qu'un
    // autre a un test en cours → échecs non déterministes. Exécution
    // séquentielle des fichiers = déterministe, coût négligeable vu la
    // taille actuelle de la suite.
    fileParallelism: false,
  },
})
