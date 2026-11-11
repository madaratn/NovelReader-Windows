// Runs inside the installed Android app (through the WebView debugger, raw
// DevTools protocol): checks the interface is up, then a real search -> novel ->
// chapter on live book sources.
const MANIFEST = 'https://raw.githubusercontent.com/LNReader/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json'
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function connect() {
  for (let i = 0; i < 30; i++) {
    try {
      const pages = await (await fetch('http://127.0.0.1:9222/json')).json()
      const p = pages.find(x => x.type === 'page' && /localhost/.test(x.url))
      if (p) return p.webSocketDebuggerUrl
    } catch {}
    await sleep(2000)
  }
  throw new Error('No app page in the WebView debugger')
}
;(async () => {
  const ws = new WebSocket(await connect())
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko })
  let id = 0; const waiting = new Map()
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id) } }
  const evaluate = (fn, arg) => new Promise((ok, ko) => {
    const n = ++id; waiting.set(n, d => d.error ? ko(new Error(d.error.message)) : d.result.exceptionDetails ? ko(new Error(JSON.stringify(d.result.exceptionDetails).slice(0, 400))) : ok(d.result.result.value))
    ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: `(${fn})(${JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true, userGesture: true } }))
  })
  let shell
  for (let i = 0; i < 30; i++) {
    shell = await evaluate(() => ({ ready: !!document.querySelector('#root')?.children.length && !!window.novelReader, android: document.documentElement.classList.contains('android'), text: document.body.innerText.slice(0, 160) }))
    if (shell.ready) break
    await sleep(1000)
  }
  console.log('interface:', JSON.stringify(shell))
  if (!shell.ready || !shell.android) throw new Error('Interface or Android bridge missing')
  const r = await evaluate(async (manifest) => {
    const all = await (await fetch(manifest)).json()
    const list = (Array.isArray(all) ? all : all.plugins).filter(p => /english/i.test(p.lang))
    const prefer = ['novelfull', 'freewebnovel', 'novelbin', 'royalroad', 'lightnovelworld', 'novelhall', 'wuxiaworld', 'boxnovel']
    const picks = [...new Set([...prefer.map(id => list.find(p => p.id.toLowerCase().includes(id))).filter(Boolean), ...list])].slice(0, 12)
    const log = []
    for (const p of picks) {
      try {
        const res = await window.novelReader.searchPlugin(p, 'shadow')
        if (!res.length) { log.push(p.id + ': 0 results'); continue }
        const novel = await window.novelReader.parseNovel(p, res[0].path)
        const ch = novel.chapters?.[0]
        const text = ch ? await window.novelReader.parseChapter(p, ch.path) : ''
        const plain = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        log.push(`${p.id}: ${res.length} results, "${novel.name}", ${novel.chapters?.length || 0} chapters, chapter text ${plain.length} chars`)
        if (plain.length > 200) return { ok: true, log, sample: plain.slice(0, 160), book: { source: p, path: res[0].path, name: novel.name, count: novel.chapters.length } }
      } catch (e) { log.push(p.id + ': ' + String(e?.message || e).slice(0, 160)) }
    }
    return { ok: false, log }
  }, MANIFEST)
  for (const l of r.log) console.log('  ' + l)
  if (r.sample) console.log('chapter sample:', r.sample)
  if (!r.ok) { console.error('No live source could be read on Android'); process.exit(1) }
  console.log('Books OK')
  // New chapters with the app closed: the hidden page (ChapterCheck.java) is run for
  // real, on a library whose saved copy of that novel misses its last chapter.
  if (r.book && r.book.count >= 2) {
    const bg = await evaluate(async b => {
      const keep = localStorage.getItem('library')
      localStorage.setItem('library', JSON.stringify([{ id: 'smoke-bg', name: b.name, source: b.source, path: b.path, chapters: Array.from({ length: b.count - 1 }, (_, i) => ({ name: 'c' + i, path: '/c' + i })) }]))
      localStorage.removeItem('bgChapterSeen')
      try { const x = await window.Capacitor.Plugins.Notify.chaptersNow(); return { ok: x.ok, result: x.result && JSON.parse(x.result), seen: localStorage.getItem('bgChapterSeen') } }
      catch (e) { return { error: String(e && e.message || e) } }
      finally { if (keep == null) localStorage.removeItem('library'); else localStorage.setItem('library', keep); localStorage.removeItem('bgChapterSeen'); localStorage.removeItem('lastUpdateCheck') }
    }, r.book)
    console.log('closed-app chapter check:', JSON.stringify(bg))
    if (!(bg.ok && bg.result && Array.isArray(bg.result.names) && bg.result.names.includes(r.book.name))) { console.error('The closed-app chapter check did not find the new chapter'); process.exit(1) }
  }
  // Reader text size in Android's real WebView: a long chapter keeps the size set in
  // the reader (no "font boosting" of paragraphs), and follows a change.
  const ts = await evaluate(async () => {
    const sec = document.createElement('section'); sec.className = 'readerpage'; sec.style.setProperty('--r-size', '18px'); sec.style.cssText += ';position:fixed;inset:0;overflow:auto;z-index:9999'
    sec.innerHTML = '<article class="readercontent"><h1>T</h1><div>' + Array.from({ length: 30 }, (_, i) => '<p>' + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(12) + '</p>').join('') + '<p><span style="font-size:11px" id="ts-span">site size</span></p></div></article>'
    document.body.appendChild(sec)
    await new Promise(r => setTimeout(r, 500))
    const size = s => parseFloat(getComputedStyle(sec.querySelector(s)).fontSize)
    const a = [size('h1'), size('p'), size('#ts-span')]
    sec.style.setProperty('--r-size', '26px'); await new Promise(r => setTimeout(r, 300))
    const b = [size('h1'), size('p'), size('#ts-span')]
    sec.remove()
    return { at18: a, at26: b }
  })
  console.log('reader text size:', JSON.stringify(ts))
  if (ts.at18[1] !== 18 || ts.at26[1] !== 26 || ts.at26[2] !== 26) { console.error('Reader text size is not applied to paragraphs in the WebView'); process.exit(1) }

  // ---- Sweep: every source that works on the PC, through the phone's engine ----
  if (process.env.SWEEP === 'true') {
    const t0 = Date.now()
    const status = await evaluate(async () => (await (await fetch('https://github.com/madaratn/NovelReader-Windows/releases/download/source-status/source-status.json')).json()).results.filter(x => x.state === 'ok' && !/torrent/i.test(x.name)))
    console.log('=== SWEEP: ' + status.length + ' sources ok on the PC ===')
    const rows = []
    for (const s of status) {
      if (Date.now() - t0 > 42 * 60000) { console.log('  (time budget reached)'); break }
      const r = await Promise.race([sleep(200000).then(() => ({ ok: false, steps: ['no answer in 200 s'], seconds: 200 })), evaluate(async s => {
        const steps = [], t = Date.now(), raw = window.novelReader
        // Every engine call gets its own limit: one hung source must not stop the sweep.
        const limit = (p, ms, what) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('timeout: ' + what)), ms))])
        const nr = { miwayomiStatus: () => limit(raw.miwayomiStatus(), 8000, 'status'), miwayomiFetch: (path, m, b) => limit(raw.miwayomiFetch(path, m, b), /install|repo/.test(path) ? 60000 : /\/videos/.test(path) ? 70000 : 40000, path.split('?')[0].split('/').pop()) }
        const fetch = (u, o) => limit(window.fetch(u, o).then(async r => { const hls = /\/hls\?/.test(u); const body = hls ? await r.text() : await r.arrayBuffer(); return { ok: r.ok, status: r.status, text: async () => body, arrayBuffer: async () => body } }), 30000, 'stream')
        const end = (ok, kind) => ({ ok, kind, steps, seconds: Math.round((Date.now() - t) / 1000) })
        try {
          for (let i = 0; i < 30; i++) { if ((await nr.miwayomiStatus()).online) break; await new Promise(r => setTimeout(r, 1000)) }
          window.__repos = window.__repos || {}
          window.__repos[s.repo] = window.__repos[s.repo] || await nr.miwayomiFetch('/api/v1/extensions/repo?url=' + encodeURIComponent(s.repo))
          const e = window.__repos[s.repo].extensions.find(x => x.pkg === s.pkg)
          if (!e) { steps.push('not in repo'); return end(false) }
          const ins = await nr.miwayomiFetch('/api/v1/extensions/install', 'POST', { repoUrl: s.repo, apk: e.apk }).catch(e => ({ ok: false, error: String(e.message || e) }))
          if (!ins.ok) { steps.push('install: ' + String(ins.error).slice(-200)); return end(false) }
          try {
            const src = (await nr.miwayomiFetch('/api/v1/sources')).anime.find(x => x.pkg === s.pkg)
            const q = (s.detail.match(/\((.+)\)$/) || [])[1]
            const page = q ? await nr.miwayomiFetch('/api/v1/anime/' + src.id + '/search?query=' + encodeURIComponent(q) + '&page=1').catch(() => null) : null
            const list = (page && page.animes && page.animes.length ? page : await nr.miwayomiFetch('/api/v1/anime/' + src.id + '/popular?page=1')).animes || []
            if (!list.length) { steps.push('no titles'); return end(false) }
            steps.push(list.length + ' titles')
            const er = await nr.miwayomiFetch('/api/v1/anime/' + src.id + '/episodes?url=' + encodeURIComponent(list[0].url)), eps = er.episodes || er
            if (!eps.length) { steps.push('no episode'); return end(false) }
            const ep = eps[eps.length - 1]
            const vr = await nr.miwayomiFetch('/api/v1/anime/' + src.id + '/videos?url=' + encodeURIComponent(ep.url)), vids = (vr.videos || vr).filter(x => /^https?:/.test(x.videoUrl || ''))
            if (!vids.length) { steps.push('no stream'); return end(false) }
            steps.push(vids.length + ' streams')
            const v = vids[0], raw = v.videoUrl, hls = /\.m3u8|\/playlist/i.test(raw)
            const qs = 'sourceId=' + src.id + '&url=' + encodeURIComponent(raw) + '&headers=' + encodeURIComponent(Object.entries(v.headers || {}).map(([k, x]) => k + ': ' + x).join('\n'))
            const res = await fetch('http://127.0.0.1:4567/api/v1/' + (hls ? 'hls' : 'proxy') + '?' + qs, { headers: hls ? {} : { Range: 'bytes=0-65535' } })
            const body = hls ? await res.text() : await res.arrayBuffer(), size = hls ? body.length : body.byteLength
            const good = res.ok && (hls ? body.includes('#EXT') : size > 1000)
            steps.push('stream ' + res.status + (good ? ' ✓' : ' ✗'))
            return end(good, hls ? 'hls' : /\.mpd/i.test(raw) ? 'dash' : 'file')
          } finally { await nr.miwayomiFetch('/api/v1/extensions/uninstall', 'POST', { pkg: s.pkg }).catch(() => {}) }
        } catch (e) { steps.push('error: ' + String(e && e.message || e).slice(0, 220)); return end(false) }
      }, s)])
      rows.push({ s, r })
      console.log(`  ${r.ok ? '✓' : '✗'} ${s.name} (${s.version}, ${r.seconds}s) ${r.steps.join(' → ')}`)
    }
    const ok = rows.filter(x => x.r.ok).length
    console.log(`=== SWEEP: ${ok}/${rows.length} work on Android (PC: ${rows.length}) ===`)
    // Read by the Android app (Sources page): what works on a phone, not only on the PC.
    require('fs').writeFileSync('shots/source-status-android.json', JSON.stringify({ at: new Date().toISOString(), tested: rows.length, results: rows.map(x => ({ name: x.s.name, pkg: x.s.pkg, version: x.s.version, state: x.r.ok ? 'ok' : 'dead', detail: x.r.steps.join(' → ') })) }))
    require('fs').writeFileSync('shots/sweep.json', JSON.stringify(rows.map(x => ({ name: x.s.name, version: x.s.version, ok: x.r.ok, steps: x.r.steps })), null, 1))
    console.log('=== engine errors ===')
    console.log(require('child_process').execSync("adb logcat -d | grep -E 'miwayomi\\] (Error|error|RxJava)|LinkageError|NoSuchMethod|NoClassDefFound|ClassNotFound|VerifyError' | tail -80").toString())
  }

  // ---- Diagnosis of one source (workflow input diag_source / diag_query) ----
  if (process.env.DIAG_SOURCE) {
    const d = await evaluate(async ([name, query]) => {
      const nr = window.novelReader, out = []
      for (let i = 0; i < 60; i++) { if ((await nr.miwayomiStatus()).online) break; await new Promise(r => setTimeout(r, 1000)) }
      const status = await (await fetch('https://github.com/madaratn/NovelReader-Windows/releases/download/source-status/source-status.json')).json()
      const s = status.results.find(x => x.name.toLowerCase() === name.toLowerCase())
      if (!s) return ['source not in the scan: ' + name]
      const step = async (label, f) => { const t = Date.now(); try { const r = await f(); out.push(label + ' (' + (Date.now() - t) + ' ms): ' + JSON.stringify(r).slice(0, 1500)); return r } catch (e) { out.push(label + ' FAILED (' + (Date.now() - t) + ' ms): ' + String(e && e.message || e).slice(0, 1500)); return null } }
      const repo = await step('repo', () => nr.miwayomiFetch('/api/v1/extensions/repo?url=' + encodeURIComponent(s.repo)))
      const e = repo && repo.extensions.find(x => x.pkg === s.pkg)
      await step('install', () => nr.miwayomiFetch('/api/v1/extensions/install', 'POST', { repoUrl: s.repo, apk: e.apk }))
      const src = (await nr.miwayomiFetch('/api/v1/sources')).anime.find(x => x.pkg === s.pkg)
      out.push('source: ' + JSON.stringify(src))
      const res = await step('search', () => nr.miwayomiFetch('/api/v1/anime/' + src.id + '/search?query=' + encodeURIComponent(query || 'naruto') + '&page=1'))
      const a = res && (res.animes || [])[0]; if (!a) return out
      const er = await step('episodes', () => nr.miwayomiFetch('/api/v1/anime/' + src.id + '/episodes?url=' + encodeURIComponent(a.url)))
      const eps = er && (er.episodes || er) || []
      const ep = eps[eps.length - 1] || eps[0]; if (!ep) return out
      out.push('episode: ' + JSON.stringify(ep).slice(0, 300))
      const vr = await step('videos', () => nr.miwayomiFetch('/api/v1/anime/' + src.id + '/videos?url=' + encodeURIComponent(ep.url)))
      await step('videos again', () => nr.miwayomiFetch('/api/v1/anime/' + src.id + '/videos?url=' + encodeURIComponent(ep.url)).then(x => ({ count: (x.videos || x).length })))
      await step('hosters', () => nr.miwayomiFetch('/api/v1/anime/' + src.id + '/hosters?url=' + encodeURIComponent(ep.url)))
      // The stream itself, as the player asks it (first three links): status, type, start of the answer.
      for (const v of ((vr && (vr.videos || vr)) || []).slice(0, 3)) {
        const raw = v.videoUrl || v.url || ''
        const hls = /\.m3u8|\/playlist/i.test(raw)
        const u = 'http://127.0.0.1:4567/api/v1/' + (hls ? 'hls' : 'proxy') + '?sourceId=' + src.id + '&url=' + encodeURIComponent(raw) + '&headers=' + encodeURIComponent(Object.entries(v.headers || {}).map(([k, x]) => k + ': ' + x).join('\n'))
        await step('stream ' + (hls ? 'hls' : 'file'), async () => { const r = await fetch(u, hls ? {} : { headers: { Range: 'bytes=0-2047' } }); const b = hls || !r.ok ? await r.text() : ''; return { status: r.status, type: r.headers.get('content-type'), length: r.headers.get('content-length'), body: b.slice(0, 400), raw: raw.slice(0, 200), headers: v.headers } })
      }
      return out
    }, [process.env.DIAG_SOURCE, process.env.DIAG_QUERY || ''])
    console.log('=== DIAG ' + process.env.DIAG_SOURCE + ' ===')
    for (const l of d) console.log('  ' + l)
    console.log('=== engine log ===')
    console.log(require('child_process').execSync("adb logcat -d | grep -E '\\[miwayomi\\]|\\[novelreader\\]|System\\.err|AndroidRuntime' | grep -vE 'Handling local|SLF4J' | tail -200").toString())
  }

  // ---- Videos: the engine inside the app, with real extensions ----
  const v = await evaluate(async () => {
    const nr = window.novelReader, log = [], t0 = Date.now()
    let st
    for (let i = 0; i < 60; i++) { st = await nr.miwayomiStatus(); if (st.online) break; await new Promise(r => setTimeout(r, 1000)) }
    if (!st.online) return { ok: 0, log: ['engine not running: ' + st.error] }
    log.push('engine up in ' + Math.round((Date.now() - t0) / 1000) + ' s: ' + JSON.stringify(st.health))
    // Sources that worked on the PC in the last source scan, older (14) and newer (16) extensions.
    const status = await (await fetch('https://github.com/madaratn/NovelReader-Windows/releases/download/source-status/source-status.json')).json()
    const ok = status.results.filter(x => x.state === 'ok' && /^(en|all)$/.test(x.lang) && !/torrent/i.test(x.name))
    const pick = [...ok.filter(x => x.version.startsWith('14.')).slice(0, 3), ...ok.filter(x => x.version.startsWith('16.')).slice(0, 4)]
    const repos = {}
    const results = []
    for (const s of pick) {
      const row = { name: s.name, version: s.version, steps: [] }
      results.push(row)
      const t = Date.now()
      try {
        repos[s.repo] = repos[s.repo] || await nr.miwayomiFetch('/api/v1/extensions/repo?url=' + encodeURIComponent(s.repo))
        const e = repos[s.repo].extensions.find(x => x.pkg === s.pkg)
        if (!e) { row.steps.push('not in repo'); continue }
        const ins = await nr.miwayomiFetch('/api/v1/extensions/install', 'POST', { repoUrl: s.repo, apk: e.apk })
        if (!ins.ok) { row.steps.push('install failed: ' + ins.error); continue }
        row.steps.push('installed (' + ins.anime + ' source)')
        const src = (await nr.miwayomiFetch('/api/v1/sources')).anime.find(x => x.pkg === s.pkg)
        const page = await nr.miwayomiFetch('/api/v1/anime/' + src.id + '/popular?page=1')
        const a = page.animes?.[0]
        if (!a) { row.steps.push('popular: empty'); continue }
        row.steps.push('popular ' + page.animes.length + ' ("' + a.title.slice(0, 40) + '")')
        const er = await nr.miwayomiFetch('/api/v1/anime/' + src.id + '/episodes?url=' + encodeURIComponent(a.url)), eps = er.episodes || er
        if (!eps.length) { row.steps.push('no episode'); continue }
        row.steps.push(eps.length + ' episodes')
        const ep = eps[eps.length - 1]
        const vr = await nr.miwayomiFetch('/api/v1/anime/' + src.id + '/videos?url=' + encodeURIComponent(ep.url)), vids = vr.videos || vr
        const vid = vids.find(x => /^https?:/.test(x.videoUrl || ''))
        if (!vid) { row.steps.push('no video link (' + vids.length + ')'); continue }
        row.steps.push(vids.length + ' links')
        // Through the engine's proxy, as the player does.
        const raw = vid.videoUrl, hls = /\.m3u8|\/playlist/i.test(raw)
        row.kind = hls ? 'hls' : /\.mpd/i.test(raw) ? 'dash' : 'file'
        const qs = 'sourceId=' + src.id + '&url=' + encodeURIComponent(raw) + '&headers=' + encodeURIComponent(Object.entries(vid.headers || {}).map(([k, x]) => k + ': ' + x).join('\n'))
        const r = await fetch('http://127.0.0.1:4567/api/v1/' + (hls ? 'hls' : 'proxy') + '?' + qs, { headers: hls ? {} : { Range: 'bytes=0-65535' } })
        const body = hls ? await r.text() : await r.arrayBuffer()
        const size = hls ? body.length : body.byteLength
        const good = r.ok && (hls ? body.includes('#EXT') : size > 1000)
        row.steps.push((hls ? 'HLS playlist ' : 'video bytes ') + r.status + ' ' + size + (good ? ' ✓' : ' ✗'))
        if (good) { row.ok = true; row.play = { sourceId: src.id, sourceName: src.name, url: a.url, title: a.title, episodes: eps.length } }
      } catch (e) { row.steps.push('error: ' + String(e && e.message || e).slice(0, 200)) } finally { row.seconds = Math.round((Date.now() - t) / 1000) }
    }
    return { ok: results.filter(x => x.ok).length, log, results }
  })
  for (const l of v.log) console.log('  ' + l)
  for (const x of v.results || []) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name} (${x.version}, ${x.kind || '-'}, ${x.seconds}s): ${x.steps.join(' → ')}`)
  console.log(`videos: ${v.ok}/${(v.results || []).length} sources stream on Android`)
  const fs = require('fs'); fs.mkdirSync('shots', { recursive: true }); fs.writeFileSync('shots/videos.json', JSON.stringify(v, null, 1))

  // Real player: the first working title, opened from the library like a person would.
  // (DASH manifests are not read by the player, on the PC either.)
  const first = (v.results || []).find(x => x.ok && x.kind === 'hls') || (v.results || []).find(x => x.ok && x.kind === 'file')
  let played = null
  if (first) {
    await evaluate(p => {
      localStorage.setItem('onboarded', '1'); localStorage.setItem('lang', 'en')
      localStorage.setItem('mode', 'series'); localStorage.setItem('lastPage:series', 'series')
      localStorage.setItem('seriesLibrary', JSON.stringify([{ id: 'smoke1', name: p.title, sourceId: p.sourceId, sourceName: p.sourceName, url: p.url, thumbnail: '', episodes: p.episodes, addedAt: Date.now() }]))
      setTimeout(() => location.reload(), 50); return true
    }, first.play)
    await sleep(6000)
    played = await evaluate(async () => {
      const wait = async (f, ms) => { for (let i = 0; i < ms / 250; i++) { const x = f(); if (x) return x; await new Promise(r => setTimeout(r, 250)) } return null }
      const btn = await wait(() => [...document.querySelectorAll('.libcard button')].find(b => /Show episodes/.test(b.textContent)), 15000)
      if (!btn) return { step: 'no library card', text: document.body.innerText.slice(0, 300) }
      btn.click()
      const go = await wait(() => document.querySelector('.media-hero .primary'), 30000)
      if (!go) return { step: 'no play button', text: document.body.innerText.slice(0, 300) }
      go.click()
      const vid = await wait(() => document.querySelector('.remote-player video'), 60000)
      if (!vid) return { step: 'no player', text: document.body.innerText.slice(0, 400) }
      vid.muted = true; vid.play().catch(() => {})
      const t = await wait(() => vid.currentTime > 2 && vid.currentTime, 60000)
      document.querySelector('.remote-player')?.scrollIntoView({ block: 'start' })
      const box = document.querySelector('.remote-player')?.getBoundingClientRect()
      return { box: box && [Math.round(box.width), Math.round(box.height)], viewport: [innerWidth, innerHeight], step: t ? 'playing' : 'not advancing', currentTime: vid.currentTime, readyState: vid.readyState, error: vid.error && vid.error.message, src: vid.currentSrc.slice(0, 120) }
    })
    console.log('player:', JSON.stringify(played))
    // Full screen (the activity shows the video over everything, in landscape).
    const fs1 = await evaluate(async () => { const v = document.querySelector('.remote-player video'); try { await v.requestFullscreen() } catch (e) { return 'refused: ' + e.message } await new Promise(r => setTimeout(r, 2500)); return { fullscreen: !!document.fullscreenElement, size: [innerWidth, innerHeight], playing: !v.paused, t: v.currentTime } })
    console.log('fullscreen:', JSON.stringify(fs1))
    require('child_process').execSync('adb exec-out screencap -p > shots/android-fullscreen.png')
    await evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); return true })
  }
  // Cloudflare on Android: the app's solver (hidden WebView, FlareSolverr API) passes a
  // check page, then the engine fetches through it and keeps the clearance.
  const cf = await evaluate(async () => {
    const out = {}
    const stats = async () => (await fetch('http://10.0.2.2:8099/stats')).json().catch(() => null)
    try {
      const t = Date.now()
      const r = await (await fetch('http://127.0.0.1:8191/v1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: 'request.get', url: 'http://10.0.2.2:8099/page', maxTimeout: 60000 }) })).json()
      out.direct = { status: r.status, message: r.message, real: String(r.solution && r.solution.response || '').includes('REAL CONTENT'), cookies: (r.solution && r.solution.cookies || []).map(c => c.name), seconds: Math.round((Date.now() - t) / 1000) }
      // Through the engine (its Cloudflare interceptor -> solver), then a JSON API on the same site.
      const p1 = await fetch('http://127.0.0.1:4567/api/v1/proxy?url=' + encodeURIComponent('http://10.0.2.2:8099/other-page'))
      out.engine = { status: p1.status, real: (await p1.text()).includes('REAL CONTENT') }
      const before = await stats()
      const p2 = await fetch('http://127.0.0.1:4567/api/v1/proxy?url=' + encodeURIComponent('http://10.0.2.2:8099/api.json'))
      out.api = { status: p2.status, body: (await p2.text()).slice(0, 80) }
      const after = await stats()
      out.newChecksForApi = after && before ? after.challenges - before.challenges : null
      out.stats = after
    } catch (e) { out.error = String(e && e.message || e) }
    return out
  })
  console.log('cloudflare:', JSON.stringify(cf))
  if (!(cf.direct && cf.direct.real && cf.engine && cf.engine.real && cf.api && cf.api.body.includes('"ok":true'))) { console.error('Cloudflare solving failed on Android'); process.exit(1) }

  // Offline videos (engine downloader): a small file through the engine, then read
  // back with a byte range as the player does, listed, deleted.
  const dl = await evaluate(async () => {
    const nr = window.novelReader, out = {}
    try {
      const src = 'http://127.0.0.1:4567/api/v1/health'
      const want = await (await fetch(src)).text()
      const { id } = await nr.dlStart({ kind: 'series', mediaId: 'smoke', mediaName: 'Smoke', episodeUrl: '/e/1', episodeName: 'E1', episodeNo: 1, mediaKey: 'series:smoke:/e/1', candidates: [{ url: src, type: 'file', title: 'test', subtitles: [] }] })
      let item
      for (let i = 0; i < 40; i++) { item = (await nr.dlList()).find(x => x.id === id); if (item && (item.state === 'done' || item.state === 'error')) break; await new Promise(r => setTimeout(r, 500)) }
      out.item = item && { state: item.state, file: item.file, size: item.size, error: item.error }
      const base = await nr.dlBase()
      const full = await fetch(base + '/' + id + '/' + item.file)
      out.full = { status: full.status, same: (await full.text()) === want }
      const part = await fetch(base + '/' + id + '/' + item.file, { headers: { Range: 'bytes=2-5' } })
      const got = await part.text()
      out.part = { status: part.status, same: got === want.slice(2, 6), range: part.headers.get('content-range'), got: got.slice(0, 80), want: want.slice(2, 6), type: part.headers.get('content-type') }
      // Same range on an address the WebView has not cached, and once more from outside (adb).
      const fresh = await fetch(base + '/' + id + '/' + item.file + '?fresh=1', { headers: { Range: 'bytes=2-5' } })
      out.fresh = { status: fresh.status, got: (await fresh.text()).slice(0, 80) }
      out.url = base + '/' + id + '/' + item.file
      out.wantPart = want.slice(2, 6)
      out.meta = (await fetch(base + '/' + id + '/meta.json')).status
      out.usage = await nr.dlUsage()
      out.id = id
    } catch (e) { out.error = String(e && e.message || e) }
    return out
  })
  try {
    require('child_process').execSync('adb forward tcp:14567 tcp:4567')
    const r = await fetch(String(dl.url).replace(':4567/', ':14567/'), { headers: { Range: 'bytes=2-5' } })
    dl.outside = { status: r.status, got: (await r.text()).slice(0, 80), range: r.headers.get('content-range'), length: r.headers.get('content-length') }
  } catch (e) { dl.outside = { error: String(e && e.message || e) } }
  dl.left = await evaluate(async id => { await window.novelReader.dlRemove(id); return (await window.novelReader.dlList()).length }, dl.id)
  console.log('downloads:', JSON.stringify(dl))
  if (!(dl.item && dl.item.state === 'done' && dl.full && dl.full.same && dl.outside && dl.outside.status === 206 && dl.outside.got === dl.wantPart && dl.part && dl.part.status === 206 && dl.part.same && dl.fresh && dl.fresh.got === dl.wantPart && dl.meta === 404 && dl.left === 0)) { console.error('Offline video downloads failed on Android'); process.exit(1) }

  // Cast: the engine looks for TVs on the network (none on the emulator; must not fail).
  const cs = await evaluate(async () => { const t = Date.now(); try { const l = await window.novelReader.castScan(); return { ok: true, tvs: l.length, seconds: Math.round((Date.now() - t) / 1000) } } catch (e) { return { ok: false, error: String(e.message || e) } } })
  console.log('cast scan:', JSON.stringify(cs))
  if (!cs.ok) { console.error('Cast scan failed on Android'); process.exit(1) }
  // In-app update (native Updater plugin): download the APK of the latest release,
  // then Android's installer must open over the app.
  const upd = await evaluate(async () => {
    const up = window.Capacitor?.Plugins?.Updater
    if (!up) return { error: 'Updater plugin missing' }
    const rels = await (await fetch('https://api.github.com/repos/madaratn/NovelReader-Windows/releases?per_page=10')).json()
    const apk = rels.flatMap(r => r.assets || []).find(a => /^NovelReader-[\d.]+\.apk$/.test(a.name))
    if (!apk) return { error: 'no apk in releases' }
    const pct = []
    up.addListener('progress', p => pct.push(p.percent))
    const t = Date.now()
    const d = await up.download({ url: apk.browser_download_url, size: apk.size })
    const i = await up.install()
    return { apk: apk.name, size: d.size, seconds: Math.round((Date.now() - t) / 1000), lastPercent: pct[pct.length - 1], install: i }
  })
  console.log('update:', JSON.stringify(upd))
  await sleep(4000)
  const top = require('child_process').execSync("adb shell dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity' | head -2").toString().trim()
  console.log('foreground:', top)
  require('child_process').execSync('adb exec-out screencap -p > shots/android-update.png')
  const installerOpened = /packageinstaller|PackageInstaller/i.test(top)
  ws.close()
  if (!installerOpened) { console.error('The update did not open Android\'s installer'); process.exit(1) }
  if (v.ok < 2) { console.error('Fewer than 2 video sources stream on Android'); process.exit(1) }
  if (!played || played.step !== 'playing') { console.error('The player did not play'); process.exit(1) }
  console.log('Android smoke test OK')
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
