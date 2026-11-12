// Video source scan: runs against a live engine (http://127.0.0.1:4567), installs
// the extensions of the given repositories one by one and checks each source end
// to end: popular list -> episodes of a title -> video streams.
// Usage: node scripts/source-scan.mjs <repoUrl>... (env: LANGS=all,en,fr  ONLY=name1,name2)
import fs from 'node:fs'

const BASE = process.env.ENGINE || 'http://127.0.0.1:4567'
const LANGS = (process.env.LANGS || 'all,en,fr').split(',')
const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
// QUERY=title: check that the sources find this title (search instead of the popular list).
const QUERY = (process.env.QUERY || '').trim()
const repos = process.argv.slice(2)

async function api(path, { method = 'GET', body, timeout = 30000 } = {}) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), timeout)
  try {
    const r = await fetch(BASE + path, { method, signal: ctl.signal, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let data; try { data = JSON.parse(text) } catch { data = text }
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + String(data?.error || text).slice(0, 200))
    return data
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'timeout ' + timeout / 1000 + 's' : String(e.message || e)) }
  finally { clearTimeout(tm) }
}
const list = (d, ...k) => Array.isArray(d) ? d : (k.map(x => d?.[x]).find(Array.isArray) || [])
const clean = s => String(s || '').replace(/^Aniyomi:\s*/i, '')

async function checkSource(src) {
  const sid = encodeURIComponent(src.id), out = { list: false, episodes: false, streams: 0, error: '', sample: '' }
  let items
  if (QUERY) {
    try { items = list(await api(`/api/v1/anime/${sid}/search?q=${encodeURIComponent(QUERY)}&query=${encodeURIComponent(QUERY)}&page=1`, { timeout: 30000 }), 'animes', 'results', 'items', 'list') }
    catch (e) { out.error = 'search: ' + e.message; return out }
    if (!items.length) { out.error = 'not found: ' + QUERY; return out }
    out.list = true; out.found = items.slice(0, 3).map(a => clean(a.title || a.name)).join(' / ')
  } else
  try { items = list(await api(`/api/v1/anime/${sid}/popular?page=1`, { timeout: 25000 }), 'animes', 'results', 'items', 'list') }
  catch (e) {
    // Some sources have no popular list: try a search instead.
    try { items = list(await api(`/api/v1/anime/${sid}/search?q=${encodeURIComponent('the')}&page=1`, { timeout: 25000 }), 'animes', 'results', 'items', 'list') }
    catch { out.error = 'list: ' + e.message; return out }
  }
  if (!items.length) { out.error = 'list empty'; return out }
  out.list = true
  for (const a of items.slice(0, 3)) {
    try {
      const eps = list(await api(`/api/v1/anime/${sid}/episodes?url=${encodeURIComponent(a.url || a.path)}`, { timeout: 40000 }), 'episodes', 'items')
      if (!eps.length) { out.error = 'no episode'; continue }
      out.episodes = true
      const ep = eps[eps.length - 1]
      const vids = list(await api(`/api/v1/anime/${sid}/videos?url=${encodeURIComponent(ep.url || ep.path)}`, { timeout: 70000 }), 'videos', 'items', 'list')
      if (vids.length) { out.streams = vids.length; out.sample = clean(a.title || a.name); out.error = ''; return out }
      out.error = 'no stream'
    } catch (e) { out.error = e.message.slice(0, 160) }
  }
  return out
}

// The engine's log (ENGINE_LOG): the lines written while one source was checked.
import { statSync, openSync, readSync, closeSync } from 'node:fs'
const ENGINE_LOG = process.env.ENGINE_LOG || ''
function logSize() { try { return ENGINE_LOG ? statSync(ENGINE_LOG).size : 0 } catch { return 0 } }
function engineLines(from) {
  if (!ENGINE_LOG) return []
  try {
    const end = logSize(), n = Math.min(end - from, 400000); if (n <= 0) return []
    const fd = openSync(ENGINE_LOG, 'r'), buf = Buffer.alloc(n); readSync(fd, buf, 0, n, from); closeSync(fd)
    const seen = new Set()
    return buf.toString('utf8').split('\n').filter(l => /exception|error|caused by|hoster|video-probe|extractor|no video|failed/i.test(l) && !/^\s+at /.test(l))
      .map(l => l.replace(/^.*?(\[|[A-Za-z]+\.)/, '$1').replace(/https?:\/\/\S{60,}/g, m => m.slice(0, 60) + '…').slice(0, 220)).filter(l => !seen.has(l) && seen.add(l)).slice(0, 8)
  } catch { return [] }
}
const results = []
for (const repoUrl of repos) {
  let exts
  try { exts = list(await api('/api/v1/extensions/repo?url=' + encodeURIComponent(repoUrl), { timeout: 60000 }), 'extensions', 'items') }
  catch (e) { console.log('repo failed', repoUrl, e.message); continue }
  // Sources asked for by name are tested even when the repository marks them NSFW
  // (some film sites are flagged that way).
  const todo = exts.filter(x => (ONLY.length || !x.nsfw) && !x.torrent && LANGS.includes(String(x.lang)) && (!ONLY.length || ONLY.some(o => clean(x.name).toLowerCase().includes(o))))
  console.log(`\n### ${repoUrl}: ${todo.length} extensions to test`)
  for (const x of todo) {
    const name = clean(x.name), started = Date.now(), logFrom = logSize()
    const row = { repo: repoUrl, name, pkg: x.pkg, lang: x.lang, version: x.version, state: 'dead', detail: '', sources: [] }
    try {
      await api('/api/v1/extensions/install', { method: 'POST', body: { repoUrl, apk: x.apk }, timeout: 120000 })
      const srcs = list(await api('/api/v1/sources'), 'anime').filter(s => s.pkg === x.pkg)
      if (!srcs.length) throw new Error('installed but no source')
      // A multi-language extension: test the English / French / all source first.
      srcs.sort((a, b) => (['en', 'fr', 'all'].includes(b.lang) ? 1 : 0) - (['en', 'fr', 'all'].includes(a.lang) ? 1 : 0))
      for (const s of srcs.slice(0, 2)) {
        const r = await checkSource(s)
        row.sources.push({ id: s.id, name: s.name, lang: s.lang, ...r })
        if (r.streams) break
      }
      const best = row.sources.find(s => s.streams) || row.sources[0]
      row.state = best?.streams ? 'ok' : best?.list ? 'partial' : 'dead'
      row.detail = (best?.found ? '[' + best.found + '] ' : '') + (best?.streams ? `${best.streams} streams (${best.sample})` : best?.error || '')
    } catch (e) { row.detail = e.message.slice(0, 160) }
    try { await api('/api/v1/extensions/uninstall', { method: 'POST', body: { pkg: x.pkg }, timeout: 30000 }) } catch {}
    console.log(`${row.state.padEnd(7)} ${String(x.lang).padEnd(4)} ${name.padEnd(28)} ${((Date.now() - started) / 1000).toFixed(0)}s  ${row.detail}`)
    // What the engine said while this source was checked (why there was no stream).
    if (row.state !== 'ok') { row.engine = engineLines(logFrom); for (const l of row.engine) console.log('        ' + l) }
    results.push(row)
  }
}
fs.writeFileSync('source-scan.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 1))
const md = ['| State | Lang | Source | Repo | Detail |', '|---|---|---|---|---|', ...results.sort((a, b) => ['ok', 'partial', 'dead'].indexOf(a.state) - ['ok', 'partial', 'dead'].indexOf(b.state)).map(r => `| ${r.state === 'ok' ? '✅' : r.state === 'partial' ? '🟠' : '❌'} | ${r.lang} | ${r.name} | ${r.repo.split('/')[3]} | ${r.detail.replace(/\|/g, '/')} |`)].join('\n')
fs.writeFileSync('source-scan.md', md)
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Video source scan\n\n' + md + '\n')
console.log(`\nok ${results.filter(r => r.state === 'ok').length} / partial ${results.filter(r => r.state === 'partial').length} / dead ${results.filter(r => r.state === 'dead').length}`)
