// src/lib/title-match.ts: same title on another source, or not.
const test = require('node:test')
const assert = require('node:assert')
const path = require('path')
const esbuild = require('esbuild')
const code = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../../src/lib/title-match.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent' }).outputFiles[0].text
const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require)
const { sameTitle, titleInfo, yearOf, searchQuery } = m.exports

test('the same title written differently matches', () => {
  for (const [a, b] of [
    ['The Office', 'Office'], ['Frieren (2023)', 'Frieren'], ['Dune (2021)', 'Dune 2021'], ['Solo Leveling Season 2', 'Solo Leveling S2 VOSTFR'],
    ['Spy x Family', 'SPY×FAMILY'.replace('×', ' x ')], ['Pokémon', 'Pokemon'], ['Fast & Furious', 'Fast and Furious'], ['Le Bureau des légendes', 'Bureau des Legendes'],
    ['Attack on Titan: The Final Season', 'Attack on Titan The Final Season'], ['Toy Story 3', 'Toy Story III'], ['Dune: Part Two', 'Dune Part 2']
  ]) assert.ok(sameTitle(a, b) >= 100, a + ' / ' + b + ' = ' + sameTitle(a, b))
})

test('another film or series does not match', () => {
  for (const [a, b] of [
    ['Dune', 'Dune: Part Two'], ['Dune', 'Dune 2'], ['Toy Story', 'Toy Story 2'], ['Solo Leveling', 'Solo Leveling Season 2'], ['Rocky', 'Rocky II'],
    ['The Office', 'The Office Christmas Party'], ['Mission: Impossible', 'Mission: Impossible - Fallout'], ['Star Wars: A New Hope', 'Star Wars: The Empire Strikes Back'],
    ['Lanterns', 'Green Lanterns'], ['Arcane', 'Arcane Legends'], ['It', 'It Chapter Two'], ['Halo', 'Hal']
  ]) assert.strictEqual(sameTitle(a, b), 0, a + ' / ' + b)
})

test('a subtitle on one side is only a likely match (70), and the year decides', () => {
  assert.strictEqual(sameTitle('Frieren', "Frieren: Beyond Journey's End"), 70)
  assert.strictEqual(sameTitle('Dune', 'Dune', 2021, 1984), 0)
  assert.strictEqual(sameTitle('Dune', 'Dune', 2021, 2021), 105)
  assert.strictEqual(sameTitle('Dune', 'Dune', 2021, 2022), 100) // one year apart (release dates differ by country)
})

test('years are read from names and details', () => {
  assert.strictEqual(yearOf('Dune (2021)'), 2021)
  assert.strictEqual(yearOf('**Year:** 2019 **Type:** Movie'), 2019)
  assert.strictEqual(yearOf('Released: March 3, 2022'), 2022)
  assert.strictEqual(yearOf('A story about 2000 knights'), undefined)
  assert.strictEqual(titleInfo('Dune 2021').year, 2021)
  assert.strictEqual(titleInfo('1917').words.join(' '), '1917') // a film called by a year
  assert.strictEqual(searchQuery('Dune (2021) [MULTI] VOSTFR'), 'Dune')
})

test('kids profiles: adult genres are refused, chosen genres are kept, unknown genres pass', () => {
  const code2 = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../../src/lib/parental.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent' }).outputFiles[0].text
  const m2 = { exports: {} }; new Function('module', 'exports', 'require', code2)(m2, m2.exports, require)
  const { kidsVerdict, genreAllowed } = m2.exports
  assert.deepStrictEqual(kidsVerdict(['Comedy', 'Ecchi'], []), { ok: false, reason: 'adult' })
  assert.deepStrictEqual(kidsVerdict('Action, Horror', []), { ok: false, reason: 'adult' })
  assert.deepStrictEqual(kidsVerdict(['Action'], ['Animation', 'Comedy']), { ok: false, reason: 'genre' })
  assert.deepStrictEqual(kidsVerdict(['Comédie', 'Aventure'], ['Comedy']), { ok: true })
  assert.deepStrictEqual(kidsVerdict([], ['Comedy']), { ok: true })
  assert.strictEqual(genreAllowed('Horror', []), false)
  assert.strictEqual(genreAllowed('Drama', ['Comedy']), false)
  assert.strictEqual(genreAllowed('Drama', []), true)
})

test('sync: the last title opened (and on which device) follows the most recent one', () => {
  const code3 = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../../src/lib/syncMerge.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent' }).outputFiles[0].text
  const m3 = { exports: {} }; new Function('module', 'exports', 'require', code3)(m3, m3.exports, require)
  const { mergeSync, pickSynced } = m3.exports
  const pc = JSON.stringify({ kind: 'series', id: 's1', name: 'Lanterns', sub: 'Episode 4', at: 1000, dev: 'pc', on: 'pc' })
  const phone = JSON.stringify({ kind: 'series', id: 's1', name: 'Lanterns', sub: 'Episode 5', at: 2000, dev: 'ph', on: 'phone' })
  assert.strictEqual(mergeSync({ lastPlay: pc }, { lastPlay: phone }).lastPlay, phone)
  assert.strictEqual(mergeSync({ lastPlay: phone }, { lastPlay: pc }).lastPlay, phone)
  assert.ok('lastPlay' in pickSynced({ lastPlay: pc, deviceTag: 'pc' }))
  assert.ok(!('deviceTag' in pickSynced({ lastPlay: pc, deviceTag: 'pc' })), 'the device itself is not synced')
})

test('sync: history of the PC and the phone together, one line per episode and day, Clear wins', () => {
  const code4 = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../../src/lib/syncMerge.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent' }).outputFiles[0].text
  const m4 = { exports: {} }; new Function('module', 'exports', 'require', code4)(m4, m4.exports, require)
  const { mergeSync, pickSynced } = m4.exports
  const day = new Date(2026, 10, 14, 10).getTime(), H = 3600e3
  const pc = [{ at: day + 2 * H, kind: 'books', id: 'a', name: 'Alpha', sub: 'Chapter 3', on: 'pc' }, { at: day, kind: 'series', id: 's', name: 'Lanterns', sub: 'Episode 1', on: 'pc' }]
  const phone = [{ at: day + 3 * H, kind: 'series', id: 's', name: 'Lanterns', sub: 'Episode 1', on: 'phone' }, { at: day - 30 * H, kind: 'books', id: 'a', name: 'Alpha', sub: 'Chapter 2', on: 'phone' }]
  const merged = JSON.parse(mergeSync({ history: JSON.stringify(pc) }, { history: JSON.stringify(phone) }).history)
  assert.deepStrictEqual(merged.map(x => x.sub + '@' + x.on), ['Episode 1@phone', 'Chapter 3@pc', 'Chapter 2@phone'])
  // "Clear" on one device: older lines do not come back from the other one
  const out = mergeSync({ history: '[]', historyClearedAt: String(day + 2.5 * H) }, { history: JSON.stringify(phone) })
  assert.deepStrictEqual(JSON.parse(out.history).map(x => x.sub), ['Episode 1'])
  assert.strictEqual(out.historyClearedAt, String(day + 2.5 * H))
  assert.ok('history' in pickSynced({ history: '[]' }))
})
