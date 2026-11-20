// Episode names of the real sources: runs against a live engine (http://127.0.0.1:4567),
// installs the extensions of the given repositories one by one and writes down how each
// source names and numbers the episodes of a few titles with several seasons, and what its
// list of seasons says. The result (episode-names.json) is what the season / episode
// reader of the app (src/lib/episode-name.ts) is checked against.
// Usage: node scripts/episode-names.mjs <repoUrl>...
//   env: LANGS=all,en,fr  ONLY=name1,name2  SHARD=1/3  QUERIES="Attack on Titan|Game of Thrones"
import fs from 'node:fs'

const BASE = process.env.ENGINE || 'http://127.0.0.1:4567'
const LANGS = (process.env.LANGS || 'all,en,fr').split(',').map(s => s.trim()).filter(Boolean)
const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
const [SHARD, SHARDS] = (process.env.SHARD || '1/1').split('/').map(Number)
const QUERIES = (process.env.QUERIES || 'Attack on Titan|Game of Thrones|The Walking Dead|Naruto|One Piece|Breaking Bad').split('|').map(s => s.trim()).filter(Boolean)
const repos = process.argv.slice(2)
const MAX_EPISODES = 500, BUDGET = 90000

async function api(path, { method = 'GET', body, timeout = 30000 } = {}) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), timeout)
  try {
    const r = await fetch(BASE + path, { method, signal: ctl.signal, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let data; try { data = JSON.parse(text) } catch { data = text }
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + String(data?.error || text).slice(0, 160))
    return data
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'timeout ' + timeout / 1000 + 's' : String(e.message || e)) }
  finally { clearTimeout(tm) }
}
const list = (d, ...k) => Array.isArray(d) ? d : (k.map(x => d?.[x]).find(Array.isArray) || [])
const clean = s => String(s || '').replace(/^Aniyomi:\s*/i, '')
const words = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
// One episode, short: [name, number, line under the name].
const row = ep => { const r = [String(ep.name ?? ep.title ?? ''), ep.episode_number ?? ep.number ?? null]; if (ep.scanlator) r.push(String(ep.scanlator)); return r }

async function episodesOf(sid, url, timeout = 40000) {
  const eps = list(await api(`/api/v1/anime/${sid}/episodes?url=${encodeURIComponent(url)}`, { timeout }), 'episodes', 'items')
  return { count: eps.length, episodes: eps.slice(0, MAX_EPISODES).map(row) }
}

async function sampleSource(src) {
  const sid = encodeURIComponent(src.id), started = Date.now(), left = () => BUDGET - (Date.now() - started)
  const out = { id: src.id, name: src.name, lang: src.lang, titles: [], notes: [] }
  const picked = new Map()
  try { for (const a of list(await api(`/api/v1/anime/${sid}/popular?page=1`, { timeout: 25000 }), 'animes', 'results', 'items', 'list').slice(0, 1)) picked.set(a.url || a.path, { how: 'popular', a }) }
  catch (e) { out.notes.push('popular: ' + e.message) }
  let found = 0
  for (const q of QUERIES) {
    if (found >= 2 || left() < 45000) break
    try {
      const items = list(await api(`/api/v1/anime/${sid}/search?q=${encodeURIComponent(q)}&query=${encodeURIComponent(q)}&page=1`, { timeout: 25000 }), 'animes', 'results', 'items', 'list')
      // The entries that are this title (a source may list each season as its own entry).
      const hits = items.filter(a => words(a.title || a.name).includes(words(q))).slice(0, 2)
      for (const a of hits) if (!picked.has(a.url || a.path)) picked.set(a.url || a.path, { how: 'search: ' + q, a })
      if (hits.length) found++
    } catch (e) { out.notes.push('search ' + q + ': ' + e.message); if (/timeout|HTTP 5/.test(e.message) && !found && picked.size === 0) break }
  }
  for (const [url, { how, a }] of picked) {
    if (left() < 8000) { out.notes.push('out of time'); break }
    const t = { how, title: clean(a.title || a.name), url: String(url).slice(0, 160) }
    if (a.season_number != null && a.season_number !== -1) t.season_number = a.season_number
    if (a.fetch_type) t.fetch_type = a.fetch_type
    try { const d = await api(`/api/v1/anime/${sid}/details?url=${encodeURIComponent(url)}`, { timeout: 20000 }); if (d?.fetch_type) t.details_fetch_type = d.fetch_type; if (d?.season_number != null && d.season_number !== -1) t.details_season_number = d.season_number }
    catch (e) { t.details_error = e.message.slice(0, 120) }
    try { Object.assign(t, await episodesOf(sid, url)) } catch (e) { t.episodes_error = e.message.slice(0, 160) }
    try {
      const seasons = list(await api(`/api/v1/anime/${sid}/seasons?url=${encodeURIComponent(url)}`, { timeout: 25000 }), 'seasons', 'items')
      t.seasons = seasons.slice(0, 40).map(s => ({ title: clean(s.title || s.name), url: String(s.url || '').slice(0, 160), season_number: s.season_number, ...(s.fetch_type ? { fetch_type: s.fetch_type } : {}) }))
      t.seasons_count = seasons.length
      // The episodes of the first seasons, as the source gives them season by season.
      for (const [k, s] of seasons.slice(0, 3).entries()) {
        if (left() < 8000) break
        try { const r = await episodesOf(sid, s.url, 30000); t.seasons[k].count = r.count; t.seasons[k].episodes = r.episodes.slice(0, 40) } catch (e) { t.seasons[k].episodes_error = e.message.slice(0, 120) }
      }
    } catch (e) { t.seasons_error = e.message.slice(0, 160) }
    out.titles.push(t)
  }
  return out
}

const results = []
for (const repoUrl of repos) {
  let exts
  try { exts = list(await api('/api/v1/extensions/repo?url=' + encodeURIComponent(repoUrl), { timeout: 60000 }), 'extensions', 'items') }
  catch (e) { console.log('repo failed', repoUrl, e.message); continue }
  const todo = exts.filter(x => (ONLY.length || !x.nsfw) && LANGS.includes(String(x.lang)) && (!ONLY.length || ONLY.some(o => clean(x.name).toLowerCase().includes(o))))
    .filter((_, i) => i % SHARDS === SHARD - 1)
  console.log(`\n### ${repoUrl}: ${todo.length} extensions`)
  for (const x of todo) {
    const name = clean(x.name), started = Date.now()
    const rec = { repo: repoUrl, name, pkg: x.pkg, lang: x.lang, version: x.version, sources: [] }
    try {
      await api('/api/v1/extensions/install', { method: 'POST', body: { repoUrl, apk: x.apk }, timeout: 120000 })
      const srcs = list(await api('/api/v1/sources'), 'anime').filter(s => s.pkg === x.pkg)
      if (!srcs.length) throw new Error('installed but no source')
      srcs.sort((a, b) => (['en', 'fr', 'all'].includes(b.lang) ? 1 : 0) - (['en', 'fr', 'all'].includes(a.lang) ? 1 : 0))
      for (const s of srcs.slice(0, 1)) rec.sources.push(await sampleSource(s))
    } catch (e) { rec.error = e.message.slice(0, 160) }
    try { await api('/api/v1/extensions/uninstall', { method: 'POST', body: { pkg: x.pkg }, timeout: 30000 }) } catch {}
    const titles = rec.sources.flatMap(s => s.titles)
    console.log(`${String(x.lang).padEnd(4)} ${name.padEnd(28)} ${((Date.now() - started) / 1000).toFixed(0).padStart(3)}s  ` + (rec.error || titles.map(t => `${t.title.slice(0, 24)}: ${t.count ?? t.episodes_error ?? '?'}${t.seasons_count ? ' (+' + t.seasons_count + ' seasons)' : ''}`).join(' | ') || rec.sources.flatMap(s => s.notes).join(' ; ').slice(0, 160)))
    for (const t of titles) for (const e of [...(t.episodes || []).slice(0, 2), ...(t.episodes || []).slice(-2)]) console.log('        ' + JSON.stringify(e).slice(0, 200))
    results.push(rec)
    fs.writeFileSync('episode-names.json', JSON.stringify({ at: new Date().toISOString(), langs: LANGS, shard: SHARD + '/' + SHARDS, results }))
  }
}
fs.writeFileSync('episode-names.json', JSON.stringify({ at: new Date().toISOString(), langs: LANGS, shard: SHARD + '/' + SHARDS, results }))
console.log(`\n${results.length} extensions, ${results.flatMap(r => r.sources).flatMap(s => s.titles).filter(t => t.count).length} titles with episodes`)
