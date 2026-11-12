// Book sources on the PC go through Chromium's network stack (session.fetch), the
// way the LNReader app goes through Android's WebView:
//  - certificates are checked like a browser does (many sites send an incomplete
//    chain that Node refuses: "unable to get issuer certificate"),
//  - cookies are kept in a session of their own ("persist:books"),
//  - when a site answers with a Cloudflare / DDoS-Guard check page, the page is
//    opened in a hidden window until the check passes; the clearance cookie then
//    serves every later request. If the check wants a click, the window is shown
//    (only when allowed: never during the automatic source check).
const PARTITION = 'persist:books'
const CHALLENGE_TITLE = /just a moment|attention required|un instant|un momento|einen moment|ddos-guard|security check|checking your browser|проверка безопасности|please wait/i

// 'strict': a real anti-bot check (Cloudflare, DDoS-Guard, Anubis…) that may want a
// click, so its window can be shown. 'script': a small page that only runs a script
// to set a cookie and reload ("Loading…", "Redirecting…", empty 403); a hidden
// window is enough.
const SCRIPT_TITLE = /^\s*(loading|redirecting|one moment|making sure you(&#39;|')re not a bot)/i
function challengeKind(status, headers, text) {
  if (headers && headers.get && headers.get('cf-mitigated') === 'challenge') return 'strict'
  const body = String(text || '')
  const title = (body.match(/<title[^>]*>([^<]{0,120})/i) || [])[1] || ''
  if ([403, 429, 503].includes(status) && (CHALLENGE_TITLE.test(title) || /challenge-platform|cf_chl_|ddos-guard/i.test(body.slice(0, 20000)))) return 'strict'
  if (/making sure you(&#39;|')re not a bot/i.test(title)) return 'strict'
  if (body.length < 12000 && (SCRIPT_TITLE.test(title) || /document\.cookie\s*=/.test(body) && /location\.(href|reload|replace)/.test(body))) return 'script'
  if (status === 403 && body.length < 200) return 'script'
  return ''
}
const isChallenge = (status, headers, text) => !!challengeKind(status, headers, text)

// A source may only reach web sites: no file:, no other scheme, and not this PC or
// the home network (the video engine, the phone link and the router live there).
function allowedBookUrl(url) {
  let u; try { u = new URL(String(url)) } catch { return false }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false
  if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h) || /^::ffff:/.test(h)) return false
  return true
}

function createBookWeb({ session, BrowserWindow, showWhenStuck = true, allowLocal = false, log = () => {} }) {
  const allowed = u => allowLocal ? /^https?:/i.test(String(u)) : allowedBookUrl(u)
  const ses = session.fromPartition(PARTITION)
  // A plain Chrome user agent (no "Electron/…"): the clearance cookie is tied to it.
  const ua = ses.getUserAgent().replace(/\s*Electron\/\S+/, '').replace(/\s*NovelReader\/\S+/i, '')
  ses.setUserAgent(ua)
  // Chromium refuses some headers from fetch (Origin, Sec-…, Host) that the sources
  // send like the LNReader app does: they travel under another name and are put
  // back just before the request leaves.
  const HIDDEN = 'x-nr-h-'
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const h = details.requestHeaders || {}
    for (const k of Object.keys(h)) if (k.toLowerCase().startsWith(HIDDEN)) { const name = k.slice(HIDDEN.length); if (name.toLowerCase() !== 'host') h[name] = h[k]; delete h[k] }
    cb({ requestHeaders: h })
  })
  // session.fetch gives no final address (response.url is empty), and many sources
  // read it (Madara sites check which domain they ended on): redirects are noted here.
  const redirects = new Map()
  ses.webRequest.onBeforeRedirect(d => { redirects.set(d.url, d.redirectURL); setTimeout(() => redirects.delete(d.url), 60000) })
  const finalUrl = u => { let x = u; for (let i = 0; i < 10 && redirects.has(x); i++) x = redirects.get(x); return x }
  // The answer is read once and handed over as an ordinary Response, with its address.
  const settle = async (r, url) => {
    const nobody = [101, 204, 205, 304].includes(r.status)
    const body = nobody ? null : Buffer.from(await r.arrayBuffer())
    const out = new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers })
    Object.defineProperty(out, 'url', { value: finalUrl(url) })
    Object.defineProperty(out, 'redirected', { value: finalUrl(url) !== url })
    return out
  }
  const prepare = headers => {
    const out = new Headers()
    new Headers(headers || {}).forEach((v, k) => { if (/^(origin|host|sec-|connection$|content-length$)/i.test(k)) { if (!/^(host|connection|content-length)$/i.test(k)) out.set(HIDDEN + k, v) } else out.set(k, v) })
    return out
  }
  // The check windows show a foreign site: nothing is granted to it (no permission,
  // no download, no new window), and it only gets http(s) pages.
  ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false))
  ses.setPermissionCheckHandler(() => false)
  ses.on('will-download', e => e.preventDefault())
  const windows = new WeakSet()
  const isCheckWindow = contents => windows.has(contents)
  const solving = new Map()

  const useless = new Map() // origin -> until when a check is not tried again (it did not help)
  function solve(url, strict = true) {
    let origin = ''
    try { origin = new URL(url).origin } catch { return Promise.resolve(false) }
    if (solving.has(origin)) return solving.get(origin)
    if (Date.now() < (useless.get(origin) || 0)) return Promise.resolve(false)
    const job = new Promise(resolve => {
      const win = new BrowserWindow({ show: false, width: 520, height: 640, title: 'NovelReader – ' + new URL(url).host, autoHideMenuBar: true, webPreferences: { partition: PARTITION, backgroundThrottling: false, sandbox: true, contextIsolation: true } })
      windows.add(win.webContents)
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      const webOnly = (e, u) => { try { if (!/^https?:$/.test(new URL(u).protocol)) e.preventDefault() } catch { e.preventDefault() } }
      win.webContents.on('will-navigate', webOnly)
      win.webContents.on('will-redirect', webOnly)
      win.webContents.on('will-attach-webview', e => e.preventDefault())
      let done = false, shown = false
      const finish = ok => { if (done) return; done = true; clearInterval(timer); clearTimeout(showTimer); clearTimeout(giveUp); try { win.destroy() } catch {} ; log('[books] check ' + (ok ? 'passed' : 'not passed') + ' ' + origin); resolve(ok) }
      const check = async () => {
        if (done || win.isDestroyed()) return
        try {
          const title = win.webContents.getTitle()
          if (win.webContents.isLoading() || !title) return
          if (!CHALLENGE_TITLE.test(title) && !SCRIPT_TITLE.test(title)) finish(true)
        } catch {}
      }
      const timer = setInterval(check, 700)
      // Still on the check page after 12 s: it probably wants a click.
      const showTimer = setTimeout(() => { if (!done && showWhenStuck && strict) { shown = true; try { win.show() } catch {} } }, 12000)
      const giveUp = setTimeout(() => finish(false), showWhenStuck && strict ? 120000 : strict ? 25000 : 12000)
      win.on('closed', () => finish(false))
      win.loadURL(url, { userAgent: ua }).catch(() => {})
    }).finally(() => setTimeout(() => solving.delete(origin), 2000))
    solving.set(origin, job)
    return job
  }

  async function fetchBook(url, init = {}) {
    if (!allowed(url)) throw new Error('Address not allowed for a book source: ' + String(url).slice(0, 80))
    const headers = prepare(init.headers)
    const go = async () => settle(await ses.fetch(url, { ...init, headers, credentials: 'include' }), String(url))
    let r = await go()
    if (r.status !== 200 || Number(r.headers.get('content-length') || 0) < 12000) {
      let text = ''
      try { text = await r.clone().text() } catch {}
      const kind = challengeKind(r.status, r.headers, text)
      if (kind) {
        // A form post cannot be replayed in a window: pass the check on the site's home page.
        const page = (init.method || 'GET').toUpperCase() === 'GET' ? String(url) : new URL(String(url)).origin + '/'
        if (await solve(page, kind === 'strict')) {
          r = await go()
          let again = ''
          try { again = await r.clone().text() } catch {}
          if (challengeKind(r.status, r.headers, again)) useless.set(new URL(String(url)).origin, Date.now() + 30 * 60e3)
        } else useless.set(new URL(String(url)).origin, Date.now() + (kind === 'strict' ? 3 : 30) * 60e3)
      }
    }
    return r
  }

  return { fetch: fetchBook, solve, isCheckWindow, allowed, solving: () => solving.size, userAgent: ua, partition: PARTITION }
}

module.exports = { createBookWeb, allowedBookUrl, isChallenge, challengeKind, PARTITION }
