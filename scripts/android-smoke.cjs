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
        if (plain.length > 200) return { ok: true, log, sample: plain.slice(0, 160) }
      } catch (e) { log.push(p.id + ': ' + String(e?.message || e).slice(0, 160)) }
    }
    return { ok: false, log }
  }, MANIFEST)
  for (const l of r.log) console.log('  ' + l)
  if (r.sample) console.log('chapter sample:', r.sample)
  if (!r.ok) { console.error('No live source could be read on Android'); process.exit(1) }
  console.log('Books OK')

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
