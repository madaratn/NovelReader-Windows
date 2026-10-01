const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), os = require('os'), path = require('path')
const { createLocalTracks, srtToVtt, assToVtt, cleanAssText, describeFileName } = require('../../electron/local-tracks.cjs')

const FIX = path.join(__dirname, '..', 'ui', 'fixtures')

test('MKV: lists embedded subtitle tracks and extracts them as WebVTT', async () => {
  const t = createLocalTracks()
  for (const name of ['tracks.mkv', 'tracks-stream.mkv']) { // sized and unknown-size (streamed) clusters
    const file = path.join(FIX, name)
    const { subtitles } = await t.list(file)
    assert.deepEqual(subtitles.map(s => [s.id, s.lang, s.label, s.codec, s.default, s.supported]), [
      ['mkv:4', 'fre', '', 'S_TEXT/UTF8', true, true],
      ['mkv:5', 'eng', 'English (signs)', 'S_TEXT/ASS', false, true],
    ])
    const fr = await t.subtitle(file, 'mkv:4')
    assert.match(fr, /^WEBVTT\n\n00:00:00\.2\d\d --> 00:00:01\.0\d\d\nBonjour <i>tout<\/i> le monde\n/)
    assert.match(fr, /Deuxième ligne\nsur deux lignes/)
    const en = await t.subtitle(file, 'mkv:5')
    assert.match(en, /Hello, world\nsecond line/)
    assert.doesNotMatch(en, /\\b1|\{/)
  }
})

test('subtitle files next to the video are found, decoded and converted', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-subs-'))
  fs.copyFileSync(path.join(FIX, 'clip.webm'), path.join(dir, 'Episode 01.webm'))
  fs.writeFileSync(path.join(dir, 'Episode 01.fr.srt'), Buffer.from('1\r\n00:00:01,000 --> 00:00:02,500\r\nD\xe9j\xe0 vu\r\n', 'latin1')) // Windows-1252
  fs.writeFileSync(path.join(dir, 'Episode 01.en.forced.ass'), '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,{\\i1}Sign{\\i0}, here\n')
  fs.writeFileSync(path.join(dir, 'Other episode.srt'), '1\n00:00:01,000 --> 00:00:02,000\nNo\n')
  fs.mkdirSync(path.join(dir, 'Subs', 'Episode 01'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'Subs', 'Episode 01', '2_English.srt'), '﻿1\n00:00:05,000 --> 00:00:06,000\n<font color="#fff">Hi</font> & bye\n')
  const t = createLocalTracks(), video = path.join(dir, 'Episode 01.webm')
  const { subtitles } = await t.list(video)
  const byFile = Object.fromEntries(subtitles.map(s => [s.id, s]))
  assert.deepEqual(Object.keys(byFile).sort(), ['file:Episode 01.en.forced.ass', 'file:Episode 01.fr.srt', path.join('file:Subs', 'Episode 01', '2_English.srt')].sort())
  assert.equal(byFile['file:Episode 01.fr.srt'].lang, 'fr')
  assert.equal(byFile['file:Episode 01.en.forced.ass'].forced, true)
  assert.match(await t.subtitle(video, 'file:Episode 01.fr.srt'), /00:00:01\.000 --> 00:00:02\.500\nDéjà vu/)
  assert.match(await t.subtitle(video, 'file:Episode 01.en.forced.ass'), /00:00:03\.000 --> 00:00:04\.000\n<i>Sign<\/i>, here/)
  assert.match(await t.subtitle(video, path.join('file:Subs', 'Episode 01', '2_English.srt')), /\nHi &amp; bye\n/)
  await assert.rejects(t.subtitle(video, 'file:../secret.srt'), /not next to the video/)
  await assert.rejects(t.subtitle(video, 'file:Episode 01.webm'), /not next to the video/)
})

test('converters and file-name languages', () => {
  assert.equal(srtToVtt('1\n00:00:01,5 --> 00:00:02,000\n{\\an8}<b>Top</b> <script>x</script>\n'), 'WEBVTT\n\n00:00:01.500 --> 00:00:02.000\n<b>Top</b> x\n')
  assert.equal(assToVtt('[Events]\nFormat: Start, End, Text\nDialogue: 0:00:01.00,0:00:02.00,a, b\\Nc\n'), 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\na, b\nc\n')
  assert.equal(cleanAssText('{\\p1}m 0 0 l 10 10{\\p0}'), '')
  assert.equal(cleanAssText('a --> b'), 'a --&gt; b') // shown as "a --> b", never read as a timing line
  assert.deepEqual(describeFileName('.French.forced'), { lang: 'fr', forced: true, label: '' })
  assert.deepEqual(describeFileName('.eng.sdh'), { lang: 'eng', forced: false, label: 'sdh' })
  assert.deepEqual(describeFileName(' - Commentary'), { lang: '', forced: false, label: 'Commentary' })
})
