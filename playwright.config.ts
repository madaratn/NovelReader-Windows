import { defineConfig } from '@playwright/test'

// UI tests run the built renderer (dist/) in Chromium with a stubbed Electron
// bridge (see tests/ui/helpers.ts). Build first: npm run build && npm run test:ui
const PORT = Number(process.env.UI_TEST_PORT || 4179)

export default defineConfig({
  testDir: 'tests/ui',
  timeout: 45_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 860 },
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Same Blink feature as the app (electron/main.cjs): video.audioTracks.
    launchOptions: { args: ['--enable-blink-features=AudioVideoTracks'] }
  },
  webServer: {
    command: `node tests/ui/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
})
