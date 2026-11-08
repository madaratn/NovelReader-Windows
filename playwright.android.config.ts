import { defineConfig } from '@playwright/test'

// The Android build (vite --mode android) in a phone-sized Chromium with a fake
// Capacitor: book sources run in the page (src/platform/android.ts).
const PORT = Number(process.env.ANDROID_TEST_PORT || 4181)
export default defineConfig({
  testDir: 'tests/android',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en-US', trace: 'retain-on-failure' },
  webServer: { command: `node tests/ui/serve.mjs ${PORT}`, env: { UI_DIST: 'dist-android' }, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: !process.env.CI, timeout: 30_000 }
})
