import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Screenshot capture for UI reviews (not part of the regular test suite).
export default defineConfig({ ...base, testDir: 'tests/screens', retries: 0, reporter: 'list', use: { ...base.use, viewport: { width: 1440, height: 900 } } })
