// src/lib/episode-name.ts: which season and which episode an entry is.
// The names below are the ones real sources send (collected by scripts/episode-names.mjs).
const test = require('node:test')
const assert = require('node:assert')
const path = require('path')
const esbuild = require('esbuild')
const code = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../../src/lib/episode-name.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent' }).outputFiles[0].text
const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require)
const { seasonNo, episodeNo, readName, readEpisodes, orderedEpisodes, episodeCode, countNo, plainName, plainSeasonNumber, seasonPlaces } = m.exports

const ep = (name, number, scanlator) => ({ name, episode_number: number == null ? -1 : number, scanlator: scanlator || null })
const code1 = e => 'S' + seasonNo(e) + 'E' + episodeNo(e, 999)
// A list as a source sends it: [name, number, line under the name] -> "S1E2" for each, in the same order.
const read = rows => { const list = rows.map(r => ep(r[0], r[1], r[2])); readEpisodes(list); return list.map(code1) }

test('one name: the season and the episode, as the sources write them', () => {
  for (const [name, number, want] of [
    // Torrentio, Cinejoy, Mapple, Castle TV, FboxTV, DopeFlix sites
    ['S1:E8 - Hardhome', 8, 'S1E8'], ['S1 E8 - The Title', 8, 'S1E8'], ['S1E7 - Brian: Portrait of a Dog', 7, 'S1E7'], ['S1 E0008: The Title', 1.0008, 'S1E8'],
    // Stremio, DooPlay sites (HDS, AnimeOnline.Ninja, Cineplus123, BetterAnime)
    ['Season 1 Ep. 8 - Title', 8, 'S1E8'], ['Season 1 x 8 - Title', 8, 'S1E8'], ['Temporada 1 x 500', 500, 'S1E500'], ['Season 1 x 51.5 - OVA', 51.5, 'S1E51.5'], ['Temporada 1 x Episódio 8', 8, 'S1E8'],
    // 4KHDHub, WatchAnimeWorld, AnimeStream, UniqueStream
    ['S01 - Episode 10: Fire and Blood', 10, 'S1E10'], ['S04 - Episode-30', 30, 'S4E30'], ['S16 - Ep. 360 - Jonin Leader', 360, 'S16E360'], ['S4 Ep. 84 - Night of the End', 84, 'S4E84'], ['S15 E1148 - The Lost History', 1148, 'S15E1148'],
    // EmpireStreaming, AniWorld, Serienstream, toonitalia
    ['Saison 8 Épisode 1 : Titre', 8.1, 'S8E1'], ['Saison 1 Épisode 10 : Titre', 1.1, 'S1E10'], ['Staffel 2 Folge 3 : Titel', 3, 'S2E3'], ['Stagione 1 - Episodi 8', 1.008, 'S1E8'],
    // Spanish sites: T = temporada
    ['T1 - E8 - Titulo', 8, 'S1E8'], ['T2 - Episodio 5', 5, 'S2E5'], ['T2 - E5 Nombre', 205, 'S2E5'], ['T3 - Episodio 4: Nombre', 4, 'S3E4'], ['T1 - E9 - Squid Game 1x9', 9, 'S1E9'], ['T12 - E243 - ¡Desembarco! ¿La isla paradisíaca?', 1, 'S12E243'], ['Temporada 2 - Nombre del episodio', 3, 'S2E3'], ['Attack on Titan 2x12', 39, 'S2E12'],
    // Russian, Ukrainian
    ['1 сезон, 8 серия', 8, 'S1E8'], ['Сезон 2 Серия 8 Имя', 8, 'S2E8'], ['Серія 49 - Світ сяючого світла', -1, 'S1E49'],
    // Arabic: the season is a number or a word, before or after the episode
    ['الموسم الثامن الحلقة 1', 1, 'S8E1'], ['الموسم 8 الحلقة 1', 8.1, 'S8E1'], ['الموسم الأول : الحلقة 10', 1.1, 'S1E10'], ['الحلقة 1 - الموسم 2', 2.001, 'S2E1'], ['الموسم الثاني عشر الحلقة 3', 3, 'S12E3'], ['07 : الحلقة', -1, 'S1E7'], ['الحلقة 220 والاخيرة - Naruto Season 1', 1.22, 'S1E220'],
    // Turkish: the number comes first
    ['Kara Sevda 2. Sezon 10. Bölüm', -1, 'S2E10'], ['8 Sezon 3 Bölüm', -1, 'S8E3'], ['Sezon 2 Bölüm 5', -1, 'S2E5'],
    // The episode before the season, a number in the title of the series
    ['Episode 8 Saison 1', 8, 'S1E8'], ['Épisode 8 - Saison 1', -1, 'S1E8'], ['The 100 Saison 2 Episode 3', 3, 'S2E3'], ['Mob Psycho 100 Saison 2 01 Vostfr', 1, 'S2E1'], ['Kimetsu no Yaiba Saison 4 08 Vostfr', 8, 'S4E8'],
    // Seasons said in words
    ['2nd Season Episode 5', 5, 'S2E5'], ['Second Season - Episode 5', 5, 'S2E5'], ['Season Two Episode 5', 5, 'S2E5'], ['Season II Episode 5', 5, 'S2E5'], ['Dr. Stone 3rd Season Episode 4', 4, 'S3E4'], ['Saison 3 Partie 2 Épisode 5', 5, 'S3E5'],
    // Chinese, glued forms, half episodes
    ['第167集', -1, 'S1E167'], ['第二季 第5集', -1, 'S2E5'], ['Ep5', -1, 'S1E5'], ['EP05', -1, 'S1E5'], ['Saison2 Episode3', -1, 'S2E3'], ['S2 - 05', -1, 'S2E5'], ['1x08', -1, 'S1E8'], ['Episode 12.5', 12.5, 'S1E12.5'],
    // No word for "episode": the number that most likely is one
    ['One Piece 1100 Vostfr', 1100, 'S1E1100'], ['86 Eighty Six 11 VOSTFR', -1, 'S1E11'], ['12 - The 2nd Raid', -1, 'S1E12'], ['[SubsPlease] Sousou no Frieren - 12 (1080p) [ABCD1234]', -1, 'S1E12'],
    // Films and specials listed beside the seasons: season 0
    ['S0:E3 - Special', 3, 'S0E3'], ['Film 1 : The Crimson Bow and Arrow[Movie]', 1, 'S0E1'], ['Movie 12: Film Z English Subbed', 12, 'S0E12'], ['Shigatsu wa Kimi no Uso - S00E01 (OVA)', -1, 'S0E1'], ['T0 - Episodio 1', 1, 'S0E1'],
    // Not a season: the number sent is kept, the title of the film is left alone
    ['Movie', 1, 'S1E1'], ['Филм: Бързи и яростни 10', 2, 'S1E2'], ['3x3 Eyes Episode 2', 2, 'S1E2'], ['One Piece Dublado Episódio 891', 891, 'S1E891'], ['Shingeki no Kyojin Episode 80 (From You, 2000 Years Ago)', 80, 'S1E80']
  ]) assert.strictEqual(code1(ep(name, number)), want, name)
})

test('a season said in the title of the episode is not the season', () => {
  for (const name of ['Episode 12: The Second Season', 'Episode 25: To the 2nd Season', 'Episode 5: Season of Love', 'Episode 1: The Four Seasons', 'Episode 14 - That Time I Got Reincarnated as a Slime Season 4 Episode 14', 'Ep. 01 - ROMANCE DAWN', 'S1:E8 - Season 2 Preview'])
    assert.strictEqual(seasonNo(ep(name, 3)), 1, name)
  // …and what stands in the title is not the episode either
  assert.strictEqual(episodeNo(ep('Season 1 Episode 8 - Season 2 teaser'), 0), 8)
  assert.strictEqual(episodeNo(ep('S5 Ep. 5 - No Regrets: Part 2', 5), 0), 5)
  assert.strictEqual(readName('Shingeki no Kyojin: Chronicle (Recap of 59 episodes)').said, false)
})

test('the season said only under the name, or packed in the number', () => {
  assert.strictEqual(code1(ep('E8 - The Title', 8, 'Season 3')), 'S3E8')
  assert.strictEqual(code1(ep('Episode 8: The Title', 8, 'Saison 2')), 'S2E8')
  assert.strictEqual(code1(ep('Episode 8', 8, 'VOSTFR, VF')), 'S1E8')
  assert.strictEqual(code1(ep('Episode 8', 2.08)), 'S2E8')
})

test('4KHDHub: every season in its own group (they were all in season 1)', () => {
  const got = read([['S08 - Episode 6: The Iron Throne', 6], ['S08 - Episode 1: Winterfell', 1], ['S02 - Episode 10: Valar Morghulis', 10], ['S02 - Episode 9: Blackwater', 9], ['S01 - Episode 10: Fire and Blood', 10], ['S01 - Episode 1: Winter Is Coming', 1], ['S00 - Episode 7: Ilse\'s Notebook', 7]])
  assert.deepStrictEqual(got, ['S8E6', 'S8E1', 'S2E10', 'S2E9', 'S1E10', 'S1E1', 'S0E7'])
})

test('WatchAnimeWorld: "S4 - Ep. 5 - Title" is season 4 (it was season 1)', () => {
  const got = read([['S4 - Ep. 30 - Attack on Titan Season 4 Episode 30', 30], ['S4 - Ep. 5 - The Declaration of War', 5], ['S2 - Ep. 12 - Attack on Titan Season 2 Episode 12', 12], ['Ep. 25 - Attack on Titan Season 1 Episode 25', 25], ['Ep. 01 - Attack on Titan Season 1 Episode 1', 1]])
  assert.deepStrictEqual(got, ['S4E30', 'S4E5', 'S2E12', 'S1E25', 'S1E1'])
})

test('the number sent is a count over every season, or a code: the name is believed', () => {
  // Cinemaos, FboxTV, SubDubAnime: (season - 1) × 100 + episode
  assert.deepStrictEqual(read([['S02E12 - Scream', 112, 'Season 2'], ['S02E11 - Charge', 111, 'Season 2'], ['S01E25 - Wall', 25, 'Season 1'], ['S01E01 - To You, in 2000 Years', 1, 'Season 1']]), ['S2E12', 'S2E11', 'S1E25', 'S1E1'])
  assert.deepStrictEqual(read([['Season 18 - Episode 18', 1718, 'ORG'], ['Season 4 - Episode 30', 330, 'ORG'], ['Season 1 - Episode 2', 2, 'ORG']]), ['S18E18', 'S4E30', 'S1E2'])
  // ShuttleTV: season × 1000 + episode
  assert.deepStrictEqual(read([['S04E28 - The Dawn of Humanity', 4028], ['S04E27 - Retrospective', 4027], ['S01E01 - To You', 1001]]), ['S4E28', 'S4E27', 'S1E1'])
  // Lunar, CineCalidad, PelisPlus: the episodes are counted from the first season on
  assert.deepStrictEqual(read([['Season 16 Episode 50', 692], ['Season 16 Episode 49', 691], ['Season 2 Episode 12', 37], ['Season 1 Episode 25', 25]]), ['S16E50', 'S16E49', 'S2E12', 'S1E25'])
  // Cimaleek, Tuktuk Cinema, Animerco: "season.episode"
  assert.deepStrictEqual(read([['الموسم 2 الحلقة 10', 2.1], ['الموسم 2 الحلقة 1', 2.01], ['الموسم 1 الحلقة 10', 1.1], ['الموسم 1 الحلقة 9', 1.09]]), ['S2E10', 'S2E1', 'S1E10', 'S1E9'])
})

test('WCO sites: the number sent is a place in the list, sub and dub side by side', () => {
  const got = read([['Episode 13.5 English Subbed', 185], ['Episode 1: English Subbed', 184], ['Season 2 - Episode 1: English Subbed', 153], ['Season 2 - Episode 2: English Subbed', 152], ['Season 4 - Episode 30: English Subbed', 120], ['Season 4 - Episode 30: English Dubbed', 1], ['Episode Special 1 English Subbed', 60]])
  assert.deepStrictEqual(got.slice(0, 6), ['S1E13.5', 'S1E1', 'S2E1', 'S2E2', 'S4E30', 'S4E30'])
  // a special without a number of its own is not given the place it has in the list
  assert.strictEqual(got[6], 'S1E999')
})

test('one title in a list says a season in passing: it stays with the others', () => {
  const list = [['Episode 15', 15, 'Sub'], ['Episode 14 - That Time I Got Reincarnated as a Slime Season 4 Episode 14', 14, 'Sub'], ['Episode 13', 13, 'Sub'], ['Episode 12', 12, 'Sub']]
  assert.deepStrictEqual(read(list), ['S1E15', 'S1E14', 'S1E13', 'S1E12'])
  // …but when every name says it there, it is the season (Animerco)
  assert.deepStrictEqual(read([['الحلقة 2 - Naruto Season 3', 3.002], ['الحلقة 1 - Naruto Season 3', 3.001]]), ['S3E2', 'S3E1'])
})

test('"seasons" that are not seasons: the list is one list', () => {
  // AnimeStream, One Piece: S14 for episodes 898 to 1074, then S16, S31, and S29 before them
  const rows = []
  const block = (s, from, to) => { for (let n = to; n >= from; n--) rows.push([`S${s} Ep. ${n} - Title`, n, 'Sub']) }
  block(31, 1159, 1168); block(16, 1095, 1104); block(14, 1060, 1074); block(29, 860, 877); block(22, 765, 781); block(11, 749, 750); block(26, 730, 733)
  const got = read(rows)
  assert.ok(got.every(c => c.startsWith('S1E')), got.slice(0, 3).join(' '))
  assert.strictEqual(got[0], 'S1E1168')
  // seasons that follow one another are kept, numbers counting on or not
  const kept = read([['S4 Ep. 84 - Night of the End', 84], ['S4 Ep. 60 - The Other Side of the Sea', 60], ['S3 Ep. 58 - Attack Titan', 58], ['S2 Ep. 26 - Beast Titan', 26], ['S1 Ep. 22 - The Defeated', 22], ['S1 Ep. 1 - To You', 1]])
  assert.deepStrictEqual(kept, ['S4E84', 'S4E60', 'S3E58', 'S2E26', 'S1E22', 'S1E1'])
  // a "season" per film, all "episode 0": films of one list, numbered by their place
  const films = read([['S122 Ep. 0 - One Piece Film: Z (English Dub)', 0], ['S102 Ep. 0 - One Piece Film: Strong World (English Dub)', 0], ['S82 Ep. 0 - One Piece Film: The Desert Princess', 0]])
  assert.deepStrictEqual(films, ['S1E3', 'S1E2', 'S1E1'])
})

test('the number sent says nothing (the same for all, or none): the names, then the order of the source', () => {
  assert.deepStrictEqual(read([['Episode 3', 1], ['Episode 2', 1], ['Episode 1', 1]]), ['S1E3', 'S1E2', 'S1E1'])
  assert.deepStrictEqual(read([['Episode 3', -1], ['Episode 2', 0], ['Episode 1', -1]]), ['S1E3', 'S1E2', 'S1E1'])
  // no number anywhere: sources list the newest first
  assert.deepStrictEqual(read([['Finale', -1], ['The Middle', -1], ['Pilot', -1]]), ['S1E3', 'S1E2', 'S1E1'])
  // seasons merged without saying so: the names repeat, the number sent does not
  assert.deepStrictEqual(read([['Episode 2', 4], ['Episode 1', 3], ['Episode 2', 2], ['Episode 1', 1]]), ['S1E4', 'S1E3', 'S1E2', 'S1E1'])
})

test('a name sent as %-codes is read as the text it stands for', () => {
  const coded = '%D8%A7%D9%84%D8%A3%D8%AE%D9%8A%D8%B1%D8%A9 : %D8%A7%D9%84%D8%AD%D9%84%D9%82%D8%A9'
  assert.strictEqual(plainName(coded), 'الأخيرة : الحلقة')
  assert.strictEqual(plainName('100% Pascal-sensei'), '100% Pascal-sensei')
  // "the last episode": no number, it comes after the numbered ones
  const list = [ep(coded), ep('02 : الحلقة'), ep('01 : الحلقة')]
  assert.deepStrictEqual(orderedEpisodes(list).map(e => e.name), ['01 : الحلقة', '02 : الحلقة', coded])
})

test('order: season, then episode; films and specials after the seasons', () => {
  const list = [ep('Film 2 : Later'), ep('Film 1 : First'), ep('Staffel 2 Folge 1 : B', 1), ep('Staffel 1 Folge 2 : A2', 2), ep('Staffel 1 Folge 1 : A1', 1), ep('Staffel 10 Folge 1 : J', 1)]
  assert.deepStrictEqual(orderedEpisodes(list).map(code1), ['S1E1', 'S1E2', 'S2E1', 'S10E1', 'S0E1', 'S0E2'])
  // reading a list twice, or an already ordered copy, changes nothing
  const again = orderedEpisodes(orderedEpisodes(list).slice())
  assert.deepStrictEqual(again.map(code1), ['S1E1', 'S1E2', 'S2E1', 'S10E1', 'S0E1', 'S0E2'])
})

test('what is written on the episodes stays with them (a copy, a saved download)', () => {
  const list = [ep('Season 2 - Episode 1: English Subbed', 153), ep('Season 2 - Episode 2: English Subbed', 152), ep('Episode 1: English Subbed', 184)]
  readEpisodes(list)
  const copy = JSON.parse(JSON.stringify(list[0]))
  assert.strictEqual(copy.season, 2); assert.strictEqual(copy.number, 1)
  assert.strictEqual(code1(copy), 'S2E1')
  // the number for AniList / MyAnimeList is the one the source sends when it is a whole number
  assert.strictEqual(countNo(list[0]), 153)
  assert.strictEqual(countNo(ep('S1 E0008: The Title', 1.0008)), 8)
  assert.strictEqual(countNo(ep('Episode 692', 692)), 692)
})

test('a source that lists its seasons one by one (Anime-Sama)', () => {
  // Naruto: two "seasons", three films with a number of their own, and "Kai"
  const naruto = [
    { title: 'Naruto Saison 1', url: '/catalogue/naruto/saison1/vostfr', season_number: 1 },
    { title: 'Naruto Saison 1hs', url: '/catalogue/naruto/saison1hs/vostfr', season_number: 2 },
    { title: 'Naruto et la Princesse des neiges', url: '/catalogue/naruto/film/vostfr#0', season_number: 3 },
    { title: 'La Légende de la pierre de Guelel', url: '/catalogue/naruto/film/vostfr#1', season_number: 3.1 },
    { title: 'Mission spéciale au pays de la Lune', url: '/catalogue/naruto/film/vostfr#2', season_number: 3.2 },
    { title: 'Naruto Kai', url: '/catalogue/naruto/kai/vostfr', season_number: 4 }
  ]
  const places = seasonPlaces(naruto, 'Naruto')
  assert.deepStrictEqual(places.map(p => p.season), [1, 2, 3, 3, 3, 4])
  assert.deepStrictEqual(places.map(p => p.name), [undefined, 'Saison 1hs', undefined, undefined, undefined, 'Kai'])
  assert.deepStrictEqual(places.map(p => !!p.films), [false, false, true, true, true, false])
  assert.strictEqual(places[2].title, 'Naruto et la Princesse des neiges')
  // plain seasons keep the number their name says, whatever the source counts
  const plain = seasonPlaces([{ title: 'One Piece Saison 1', url: '/a/saison1', season_number: 1 }, { title: 'One Piece Saison 3', url: '/a/saison3', season_number: 2 }], 'One Piece')
  assert.deepStrictEqual(plain.map(p => [p.season, p.name]), [[1, undefined], [3, undefined]])
  // two entries for one number: the order of the source decides, each keeps its name
  const twice = seasonPlaces([{ title: 'Show Season 1', url: '/1', season_number: 1 }, { title: 'Show Season 1 (Dub)', url: '/1d', season_number: 1 }, { title: 'Show Season 2', url: '/2', season_number: 2 }], 'Show')
  assert.deepStrictEqual(twice.map(p => p.season), [1, 2, 3])
  assert.deepStrictEqual(twice.map(p => p.name), [undefined, 'Season 1 (Dub)', 'Season 2'])
  assert.strictEqual(plainSeasonNumber('Saison 2'), 2); assert.strictEqual(plainSeasonNumber('Saison 1hs'), null); assert.strictEqual(plainSeasonNumber('Kai'), null)
  // the episodes of such a season carry it: "E5" under a named season, "S2E5" under a plain one
  assert.strictEqual(episodeCode({ name: 'Episode 5', episode_number: 5, season: 2 }, 0), 'S2E5')
  assert.strictEqual(episodeCode({ name: 'Episode 5', episode_number: 5, season: 2, season_name: 'Saison 1hs' }, 0), 'E5')
  assert.strictEqual(episodeCode({ name: 'Film 1 : First' }, 0), 'E1')
})
