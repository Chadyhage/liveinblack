import { defineConfig, devices } from 'playwright/test'

const port = Number(process.env.PLAYWRIGHT_PORT || '3001')
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          PORT: String(port),
          NODE_ENV: 'development',
          NEXT_TELEMETRY_DISABLED: '1',
          PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
          AUTH_SECRET: 'playwright-local-secret',
          AUTH_TRUST_HOST: 'true',
          LIB_E2E_DISABLE_RATE_LIMIT: process.env.LIB_RUN_SEEDED_E2E === '1' ? '1' : '0',
          VAPID_PUBLIC_KEY: 'BLHDbCml1KLDYOCfgAb7accjOjW0TdudKVMgGOZ2ALdyW6MS1Jx96Xci_ISGdle0ws3o16KCamkGSPQulTAmhS0',
          VAPID_PRIVATE_KEY: 'Wb1p7v4mlzDFy51HXXtDVIdYwpjUII5HTDr6pcbJQ8c',
          STRIPE_SECRET_KEY: 'sk_test_liveinblack_e2e',
          STRIPE_WEBHOOK_SECRET: 'whsec_liveinblack_e2e',
          FEDAPAY_WEBHOOK_SECRET: 'fedapay-e2e-secret',
          CLOUDINARY_CLOUD_NAME: 'liveinblack-e2e',
          CLOUDINARY_API_KEY: 'e2e-api-key',
          CLOUDINARY_API_SECRET: 'e2e-api-secret',
          CLOUDINARY_PUBLIC_UPLOAD_PRESET: 'e2e-public-preset',
          MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/liveinblack_e2e_test',
        },
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
