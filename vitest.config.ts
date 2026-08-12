import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

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
    // Deux projets distincts (audit du 12/08/2026, "aucun test frontend") :
    // - "server" : suite backend existante, environnement 'node', fichiers
    //   `.test.ts` sous __tests__ — inchangé.
    // - "frontend" : nouveaux tests de composants/logique UI, environnement
    //   jsdom, fichiers `.test.tsx` — colocalisés avec le code qu'ils
    //   testent (ex. app/components/ui/Button.test.tsx), pas dans un
    //   __tests__ séparé (convention Testing Library la plus courante,
    //   distincte du pattern __tests__ déjà établi côté serveur pour ne pas
    //   le perturber).
    projects: [
      {
        resolve: { alias: { '@': new URL('.', import.meta.url).pathname } },
        test: {
          name: 'server',
          environment: 'node',
          include: ['**/__tests__/**/*.test.ts'],
          exclude: [
            '**/node_modules/**',
            '**/.next/**',
            '**/old/**',
            ...(!integrationTestsEnabled ? ['**/*.integration.test.ts'] : []),
          ],
          // Les tests d'intégration (*.integration.test.ts) partagent une
          // vraie base MongoDB via MONGODB_TEST_URI (transactions réelles
          // obligent) — leurs beforeEach purgent les mêmes collections. En
          // parallèle (comportement par défaut de Vitest), un fichier peut
          // vider la base pendant qu'un autre a un test en cours → échecs
          // non déterministes. Exécution séquentielle des fichiers =
          // déterministe, coût négligeable vu la taille actuelle de la suite.
          fileParallelism: false,
        },
      },
      {
        plugins: [react()],
        resolve: { alias: { '@': new URL('.', import.meta.url).pathname } },
        test: {
          name: 'frontend',
          environment: 'jsdom',
          // `.test.tsx` (composants) ET `.test.ts` colocalisé (logique pure
          // extraite d'un composant, ex. mergeMessages.test.ts) — mais
          // jamais sous __tests__ (réservé au projet "server" ci-dessus,
          // sinon un test d'intégration Mongoose serait exécuté deux fois,
          // une fois sous jsdom où le driver Mongo natif ne fonctionne pas).
          include: ['**/*.test.tsx', '**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/.next/**', '**/old/**', '**/__tests__/**'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
})
