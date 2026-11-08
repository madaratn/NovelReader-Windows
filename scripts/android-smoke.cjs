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
    ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: `(${fn})(${JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true } }))
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
  ws.close()
  if (!r.ok) { console.error('No live source could be read on Android'); process.exit(1) }
  console.log('Android smoke test OK')
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
