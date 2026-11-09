import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-ignore - plain CommonJS helper
import { lightTheme } from './scripts/light-theme.cjs'

// Content Security Policy for the packaged app (not added in dev, where Vite
// needs inline scripts for hot reload). Chapters are third-party HTML: no
// script may run except the app bundle, and nothing can be framed or posted.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' blob: nrlocal: http://127.0.0.1:* http://localhost:*",
  "connect-src 'self' https: wss://0.peerjs.com http://127.0.0.1:* http://localhost:*",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')


// Light theme generated from style.css (see scripts/light-theme.cjs).
const light = (): Plugin => ({
  name: 'novelreader-light-theme',
  enforce: 'pre',
  transform(code, id) { if (/[\\/]src[\\/]style\.css(\?|$)/.test(id)) return { code: code + lightTheme(code), map: null } }
})

// The Android app (Capacitor) runs book sources in the page: they are evaluated
// with new Function, and requests go through the native layer.
const ANDROID_CSP = CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'").replace(/connect-src [^;]+/, 'connect-src * data: blob:').replace(/media-src [^;]+/, 'media-src * blob: data:')
const cspFor = (mode: string): Plugin => ({
  name: 'novelreader-csp',
  apply: 'build',
  transformIndexHtml: html => html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${mode === 'android' ? ANDROID_CSP : CSP}" />`)
})
// @ts-ignore - JSON import of the version
import pkg from './package.json'

export default defineConfig(({ mode }) => ({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [light(), react(), cspFor(mode)],
  base: './',
  // Android: also runs on phones whose WebView was not updated for a while.
  build: { outDir: 'dist', ...(mode === 'android' ? { target: ['es2019', 'chrome79'] } : {}) }
}))
