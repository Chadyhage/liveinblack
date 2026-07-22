import { defineConfig } from 'vitest/config'

const integrationTestsEnabled = Boolean(process.env.MONGODB_URI)

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
    // MongoDB via MONGODB_URI (transactions réelles obligent) — leurs
    // beforeEach purgent les mêmes collections. En parallèle (comportement
    // par défaut de Vitest), un fichier peut vider la base pendant qu'un
    // autre a un test en cours → échecs non déterministes. Exécution
    // séquentielle des fichiers = déterministe, coût négligeable vu la
    // taille actuelle de la suite.
    fileParallelism: false,
  },
})
