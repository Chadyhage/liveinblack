import baseConfig from './vitest.config'

const integrationTestUri = process.env.MONGODB_TEST_URI?.trim() || ''

if (!integrationTestUri) {
  console.warn('MONGODB_TEST_URI est absent, les tests d’intégration seront ignorés en local.')
}

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: integrationTestUri ? ['**/*.integration.test.ts'] : [],
    exclude: ['**/node_modules/**', '**/.next/**', '**/old/**'],
    passWithNoTests: true,
  },
}
