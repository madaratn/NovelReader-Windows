// node --test tests/unit
const test = require('node:test')
const assert = require('node:assert')
const JSZip = require('jszip')
const { readBackup, mapNovel } = require('../../electron/lnreader-import.cjs')

const ch = (i, extra = {}) => ({ id: 100 + i, novelId: 1, path: `/novel/x/chapter-${i}`, name: `Chapter ${i}`, unread: true, readTime: null, progress: null, position: i, ...extra })

async function makeBackup({ nested = false, novels }) {
  const inner = new JSZip()
  inner.file('Version.json', JSON.stringify({ appVersion: '2.0.3', formatVersion: 2, sections: { library: true } }))
  novels.forEach((n, i) => inner.file(`NovelAndChapters/${i + 1}.json`, JSON.stringify(n)))
  inner.file('Category.json', '[]')
  if (!nested) return inner.generateAsync({ type: 'nodebuffer' })
  const outer = new JSZip()
  outer.file('data.zip', await inner.generateAsync({ type: 'nodebuffer' }))
  outer.file('download.zip', await new JSZip().generateAsync({ type: 'nodebuffer' }))
  return outer.generateAsync({ type: 'nodebuffer' })
}

const reading = { id: 1, pluginId: 'royalroad', path: '/fiction/1', name: 'Mother of Learning', author: 'nobody103', cover: 'https://img.test/mol.jpg', inLibrary: true,
  chapters: [ch(1, { unread: false, readTime: '2026-09-20 10:00:00' }), ch(2, { unread: false, readTime: '2026-09-21 21:30:00', progress: 40 }), ch(3), ch(4)] }
const notInLibrary = { ...reading, id: 2, path: '/fiction/2', name: 'Browsed only', inLibrary: false }
const unstarted = { id: 3, pluginId: 'scribblehub', path: '/series/3', name: 'Beware of Chicken', cover: 'file:///local/cover.png', inLibrary: 1, chapters: [ch(1), ch(2)] }

test('reads a current-format LNReader backup', async () => {
  const r = await readBackup(await makeBackup({ novels: [reading, notInLibrary, unstarted] }))
  assert.equal(r.appVersion, '2.0.3')
  assert.equal(r.novels.length, 2)
  assert.equal(r.skipped, 1) // not in library
  const mol = r.novels.find(n => n.name === 'Mother of Learning')
  assert.equal(mol.pluginId, 'royalroad')
  assert.equal(mol.chapters.length, 4)
  assert.deepEqual(mol.reading && { index: mol.reading.index, path: mol.reading.path, scroll: mol.reading.scroll }, { index: 1, path: '/novel/x/chapter-2', scroll: 0.4 })
  const boc = r.novels.find(n => n.name === 'Beware of Chicken')
  assert.equal(boc.reading, null)
  assert.equal(boc.cover, '') // local file covers are not usable on the PC
})

test('reads older backups nesting the data in data.zip', async () => {
  const r = await readBackup(await makeBackup({ nested: true, novels: [reading] }))
  assert.equal(r.novels.length, 1)
})

test('orders chapters by position and falls back to the furthest read chapter', () => {
  const n = mapNovel({ pluginId: 'p', path: '/n', name: 'N', chapters: [ch(3, { position: 3 }), ch(1, { position: 1, unread: false }), ch(2, { position: 2, unread: false })] })
  assert.deepEqual(n.chapters.map(c => c.name), ['Chapter 1', 'Chapter 2', 'Chapter 3'])
  assert.equal(n.reading.index, 1)
})

test('rejects files that are not LNReader backups', async () => {
  await assert.rejects(readBackup(Buffer.from('hello')), /not an LNReader backup/)
  const empty = await new JSZip().file('x.txt', 'x').generateAsync({ type: 'nodebuffer' })
  await assert.rejects(readBackup(empty), /No novels were found/)
})
