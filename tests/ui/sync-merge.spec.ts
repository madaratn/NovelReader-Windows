// Pure tests of the folder-sync merge (no browser needed).
import { test, expect } from '@playwright/test'
import { mergeSync, pickSynced, changedKeys } from '../../src/lib/syncMerge'

const lib = (...items: any[]) => JSON.stringify(items)
const ids = (d: Record<string, string>) => JSON.parse(d.library).map((n: any) => n.id)
const ch = (n: number) => Array.from({ length: n }, (_, i) => ({ name: 'C' + (i + 1), path: '/c' + (i + 1) }))

test('library: union, remote-only novels first, longer chapter list wins', () => {
  const local = { library: lib({ id: 'a', name: 'A', addedAt: 10, chapters: ch(5) }, { id: 'b', name: 'B', addedAt: 20, chapters: ch(3) }) }
  const remote = { library: lib({ id: 'c', name: 'C', addedAt: 30, chapters: ch(2) }, { id: 'a', name: 'A', addedAt: 10, chapters: ch(8), chapterCount: 8 }) }
  const m = mergeSync(local, remote)
  expect(ids(m)).toEqual(['c', 'a', 'b'])
  expect(JSON.parse(m.library)[1].chapters.length).toBe(8)
})

test('library: a removal wins over older copies, a later re-add wins over the removal', () => {
  const local = { library: lib({ id: 'b', addedAt: 20 }), libraryRemoved: JSON.stringify({ a: 100 }) }
  const remote = { library: lib({ id: 'a', addedAt: 10 }, { id: 'b', addedAt: 20 }) }
  expect(ids(mergeSync(local, remote))).toEqual(['b'])
  const readded = { library: lib({ id: 'a', addedAt: 200 }, { id: 'b', addedAt: 20 }) }
  expect(ids(mergeSync(local, readded))).toEqual(['a', 'b'])
})

test('shelf: the most recent choice wins', () => {
  const local = { library: lib({ id: 'a', shelf: 'reading', shelfAt: 5 }) }
  const remote = { library: lib({ id: 'a', shelf: 'dropped', shelfAt: 9 }) }
  expect(JSON.parse(mergeSync(local, remote).library)[0].shelf).toBe('dropped')
  expect(JSON.parse(mergeSync(remote, local).library)[0].shelf).toBe('dropped')
})

test('reading positions: most recent wins, positions only known remotely are kept', () => {
  const local = { 'reading:a': JSON.stringify({ index: 4, at: 100 }), 'reading:b': JSON.stringify({ index: 1, at: 900 }) }
  const remote = { 'reading:a': JSON.stringify({ index: 9, at: 500 }), 'reading:b': JSON.stringify({ index: 0, at: 50 }), 'reading:c': JSON.stringify({ index: 2, at: 1 }) }
  const m = mergeSync(local, remote)
  expect(JSON.parse(m['reading:a']).index).toBe(9)
  expect(JSON.parse(m['reading:b']).index).toBe(1)
  expect(JSON.parse(m['reading:c']).index).toBe(2)
})

test('annotations: union, latest edit wins, deletions stick', () => {
  const local = { annotations: JSON.stringify([{ id: 'x', note: 'old', at: 1 }, { id: 'y', at: 1 }]), annotationsRemoved: JSON.stringify({ z: 50 }) }
  const remote = { annotations: JSON.stringify([{ id: 'x', note: 'new', at: 5 }, { id: 'z', at: 10 }, { id: 'w', at: 3 }]) }
  const m = JSON.parse(mergeSync(local, remote).annotations)
  expect(m.map((a: any) => a.id).sort()).toEqual(['w', 'x', 'y'])
  expect(m.find((a: any) => a.id === 'x').note).toBe('new')
})

test('reading statistics are never double-counted', () => {
  const local = { readingStats: JSON.stringify({ '2026-10-01': { c: 3, s: 600 } }) }
  const remote = { readingStats: JSON.stringify({ '2026-10-01': { c: 5, s: 300 }, '2026-09-30': { c: 1, s: 60 } }) }
  expect(JSON.parse(mergeSync(local, remote).readingStats)).toEqual({ '2026-10-01': { c: 5, s: 600 }, '2026-09-30': { c: 1, s: 60 } })
})

test('merging is stable: merging the result again changes nothing', () => {
  const local = { library: lib({ id: 'a', addedAt: 1, chapters: ch(2) }), 'reading:a': JSON.stringify({ index: 1, at: 5 }) }
  const remote = { library: lib({ id: 'b', addedAt: 2 }), annotations: JSON.stringify([{ id: 'n', at: 1 }]) }
  const once = mergeSync(local, remote)
  expect(changedKeys(once, mergeSync(once, remote))).toEqual([])
  expect(changedKeys(once, mergeSync(once, once))).toEqual([])
})

test('only synced keys are shared (preferences stay on each PC)', () => {
  expect(Object.keys(pickSynced({ library: '[]', 'reading:a': '{}', readerPrefs: '{}', lang: 'fr', appTheme: 'light', annotations: '[]' })).sort())
    .toEqual(['annotations', 'library', 'reading:a'])
})

test('video libraries: union, removals, statuses, positions and watch stats', () => {
  const local = {
    seriesLibrary: lib({ id: 's1', name: 'Lanterns', addedAt: 10, episodes: 8, shelf: 'watching', shelfAt: 5 }),
    animeLibrary: lib({ id: 'a1', addedAt: 10 }),
    mediaRemoved: JSON.stringify({ 'animeLibrary:a2': 100 }),
    'mediapos:series:s1:/ep/3': JSON.stringify({ t: 100, d: 2700, at: 50 }),
    'lastEpInfo:s1': JSON.stringify({ url: '/ep/3', n: 3, at: 50 }), 'lastEp:s1': '/ep/3',
    watchStats: JSON.stringify({ '2026-10-01': { s: 600, e: 1 } })
  }
  const remote = {
    seriesLibrary: lib({ id: 's2', name: 'The Bear', addedAt: 30 }, { id: 's1', addedAt: 10, episodes: 10, shelf: 'completed', shelfAt: 9 }),
    animeLibrary: lib({ id: 'a1', addedAt: 10 }, { id: 'a2', addedAt: 20 }),
    'mediapos:series:s1:/ep/3': JSON.stringify({ t: 900, d: 2700, at: 80 }),
    'lastEpInfo:s1': JSON.stringify({ url: '/ep/4', n: 4, at: 90 }),
    'prefServer:s1': 'Hermes - 1080p',
    watchStats: JSON.stringify({ '2026-10-01': { s: 300, e: 2 }, '2026-10-02': { s: 120, e: 0 } })
  }
  const m = mergeSync(local, remote)
  const series = JSON.parse(m.seriesLibrary)
  expect(series.map((x: any) => x.id)).toEqual(['s2', 's1'])
  expect(series[1].episodes).toBe(10)
  expect(series[1].shelf).toBe('completed')
  expect(JSON.parse(m.animeLibrary).map((x: any) => x.id)).toEqual(['a1']) // a2 was removed here
  expect(JSON.parse(m['mediapos:series:s1:/ep/3']).t).toBe(900)
  expect(m['lastEp:s1']).toBe('/ep/4')
  expect(m['prefServer:s1']).toBe('Hermes - 1080p')
  expect(JSON.parse(m.watchStats)).toEqual({ '2026-10-01': { s: 600, e: 2 }, '2026-10-02': { s: 120, e: 0 } })
  expect(Object.keys(pickSynced({ seriesLibrary: '[]', 'mediapos:x': '{}', theme: 'dark' }))).toEqual(['seriesLibrary', 'mediapos:x'])
})
