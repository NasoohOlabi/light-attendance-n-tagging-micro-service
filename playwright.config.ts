import { defineConfig, devices } from '@playwright/test'

import { z } from 'zod'

const port = z.coerce
  .number()
  .int()
  .min(1024)
  .max(65535)
  .parse(process.env.PLAYWRIGHT_PORT ?? 4173)
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  outputDir: '.artifacts/test-results',
  reporter: [['list'], ['html', { outputFolder: '.artifacts/playwright-report', open: 'never' }]],
  use: {
    baseURL: origin,
    trace: 'on',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: `bun run preview -- --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: false,
  },
})
