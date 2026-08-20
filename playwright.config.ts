import { defineConfig, devices } from 'playwright/test'

const port = Number(process.env.PORT || '3000')
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
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
        command: 'npm run dev -- --hostname 127.0.0.1 --port 3000',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          PORT: '3000',
          NODE_ENV: 'development',
          NEXT_TELEMETRY_DISABLED: '1',
          PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
          AUTH_SECRET: 'playwright-local-secret',
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
