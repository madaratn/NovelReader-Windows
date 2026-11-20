// src/lib/episode-name.ts against the lists real sources send.
// tests/fixtures/episode-names.json.gz holds 431 lists of episodes (their names, the number
// and the line sent beside each) collected from the live sources by scripts/episode-names.mjs;
// long lists keep their two ends and a thinned middle. What the reader says of each list is
// written in tests/fixtures/episode-names.expected.json. A change of the reader that changes a
// reading shows here, list by list. When the change is the one wanted:
//   UPDATE=1 node --test tests/unit/episode-names-real.test.cjs   (then read the diff of the file)
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const crypto = require('crypto')
const esbuild = require('esbuild')
const code = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../../src/lib/episode-name.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent' }).outputFiles[0].text
const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require)
const { seasonNo, episodeNo, orderedEpisodes } = m.exports

const FIXTURE = path.join(__dirname, '../fixtures/episode-names.json.gz'), EXPECTED = path.join(__dirname, '../fixtures/episode-names.expected.json')
const lists = JSON.parse(zlib.gunzipSync(fs.readFileSync(FIXTURE)).toString('utf8'))
// One list as the reader sees it: its seasons, how it starts and ends, and a mark of every reading.
function reading(l) {
  const ordered = orderedEpisodes(l.episodes.map(e => ({ name: e[0], episode_number: e[1], scanlator: e[2] || null })))
  const codes = ordered.map((e, i) => 'S' + seasonNo(e) + 'E' + episodeNo(e, i + 1))
  const count = new Map(); for (const e of ordered) count.set(seasonNo(e), (count.get(seasonNo(e)) || 0) + 1)
  return { list: `${l.lang} ${l.source} — ${l.title} (${l.episodes.length})`, seasons: [...count].map(([s, n]) => 'S' + s + ':' + n).join(' '), first: codes.slice(0, 3).join(' '), last: codes.slice(-3).join(' '), all: crypto.createHash('sha1').update(codes.join(',')).digest('hex').slice(0, 10) }
}

test('the lists of the real sources are read as recorded', () => {
  const got = lists.map(reading)
  if (process.env.UPDATE) { fs.writeFileSync(EXPECTED, JSON.stringify(got, null, 1) + '\n'); return }
  const want = JSON.parse(fs.readFileSync(EXPECTED, 'utf8'))
  assert.strictEqual(got.length, want.length, 'the fixture and what is expected of it do not go together')
  const changed = got.map((g, i) => [g, want[i]]).filter(([g, w]) => JSON.stringify(g) !== JSON.stringify(w))
  assert.strictEqual(changed.length, 0, changed.length + ' list(s) read differently:\n' + changed.slice(0, 10).map(([g, w]) => `  ${g.list}\n    was: ${w.seasons} | ${w.first} … ${w.last}\n    now: ${g.seasons} | ${g.first} … ${g.last}`).join('\n'))
})

test('in every real list, what is read holds together', () => {
  for (const l of lists) {
    const ordered = orderedEpisodes(l.episodes.map(e => ({ name: e[0], episode_number: e[1], scanlator: e[2] || null })))
    assert.strictEqual(ordered.length, l.episodes.length, l.source + ' — ' + l.title)
    for (const e of ordered) {
      const s = seasonNo(e), n = episodeNo(e, 1)
      assert.ok(Number.isFinite(s) && s >= 0 && s < 200, `${l.source} — ${l.title}: season ${s} for ${JSON.stringify(e.name)}`)
      assert.ok(Number.isFinite(n) && n >= 0 && n < 100000, `${l.source} — ${l.title}: episode ${n} for ${JSON.stringify(e.name)}`)
    }
  }
})
