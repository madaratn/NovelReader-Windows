import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Content Security Policy for the packaged app (not added in dev, where Vite
// needs inline scripts for hot reload). Chapters are third-party HTML: no
// script may run except the app bundle, and nothing can be framed or posted.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' blob: nrlocal: http://127.0.0.1:* http://localhost:*",
  "connect-src 'self' https: http://127.0.0.1:* http://localhost:*",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

const csp = (): Plugin => ({
  name: 'novelreader-csp',
  apply: 'build',
  transformIndexHtml: html => html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
})

export default defineConfig({
  plugins: [react(), csp()],
  base: './',
  build: { outDir: 'dist' }
})
