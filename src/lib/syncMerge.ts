// Folder sync: merge the data of this PC with the copy written by other PCs.
// Pure functions (no DOM, no storage) so they are easy to test.
//
// Rules — nothing is ever lost silently:
// - library: union by novel id; a removal (tombstone) wins over copies added
//   before it, a later re-add wins over the removal; the longer chapter list
//   wins; the shelf chosen most recently wins.
// - reading:<id>: the most recent position wins.
// - annotations: union by id, latest edit wins, deletions are tombstoned.
// - readingStats: per day, the larger count/time (never double-counted).
// - animeLibrary / seriesLibrary / movieLibrary: union by id with tombstones
//   (mediaRemoved), larger episode count, latest status (shelfAt) wins.
// - mediapos:<key> (video position, watched flag) and lastEpInfo:<id>: most
//   recent wins; lastEp:<id> follows lastEpInfo; prefServer:<id> kept if known.
// - watchStats: per day, the larger value.
// Preferences (theme, language, layout…) stay per PC and are not synced.

export type SyncData = Record<string, string>

export const MEDIA_LIBS = ['animeLibrary', 'seriesLibrary', 'movieLibrary']
export const isSyncedKey = (k: string) =>
  k === 'library' || k === 'libraryRemoved' || k === 'annotations' || k === 'annotationsRemoved' || k === 'readingStats' || k.startsWith('reading:') ||
  MEDIA_LIBS.includes(k) || k === 'mediaRemoved' || k === 'watchStats' || k.startsWith('mediapos:') || k.startsWith('lastEpInfo:') || k.startsWith('lastEp:') || k.startsWith('prefServer:')

export function pickSynced(all: Record<string, string>): SyncData {
  const out: SyncData = {}
  for (const [k, v] of Object.entries(all)) if (isSyncedKey(k)) out[k] = v
  return out
}

const parse = <T,>(s: string | undefined, fallback: T): T => { try { const v = s == null ? fallback : JSON.parse(s); return v ?? fallback } catch { return fallback } }

function mergeTombstones(a: Record<string, number>, b: Record<string, number>) {
  const out: Record<string, number> = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] || 0, Number(v) || 0)
  return out
}

function mergeNovel(local: any, remote: any) {
  const lc = Array.isArray(local.chapters) ? local.chapters.length : 0
  const rc = Array.isArray(remote.chapters) ? remote.chapters.length : 0
  const out = { ...local }
  if (rc > lc) { out.chapters = remote.chapters; out.chapterCount = remote.chapterCount ?? rc }
  if ((Number(remote.shelfAt) || 0) > (Number(local.shelfAt) || 0)) { out.shelf = remote.shelf; out.shelfAt = remote.shelfAt }
  out.addedAt = Math.max(Number(local.addedAt) || 0, Number(remote.addedAt) || 0) || local.addedAt
  if (!out.cover && remote.cover) out.cover = remote.cover
  return out
}

export function mergeSync(local: SyncData, remote: SyncData): SyncData {
  const out: SyncData = {}
  // Library + removals
  const removed = mergeTombstones(parse(local.libraryRemoved, {}), parse(remote.libraryRemoved, {}))
  const lLib: any[] = parse(local.library, []), rLib: any[] = parse(remote.library, [])
  const byId = new Map<string, any>()
  for (const n of lLib) if (n && n.id != null) byId.set(String(n.id), n)
  const remoteOnly: any[] = []
  for (const n of rLib) {
    if (!n || n.id == null) continue
    const id = String(n.id)
    if (byId.has(id)) byId.set(id, mergeNovel(byId.get(id), n))
    else { byId.set(id, n); remoteOnly.push(n) }
  }
  const alive = (n: any) => !(removed[String(n.id)] >= (Number(n.addedAt) || 0))
  const ordered = [...remoteOnly.sort((a, b) => (Number(b.addedAt) || 0) - (Number(a.addedAt) || 0)), ...lLib.filter(n => n && n.id != null)]
  const seen = new Set<string>(), lib: any[] = []
  for (const n of ordered) { const id = String(n.id); if (seen.has(id)) continue; seen.add(id); const m = byId.get(id); if (alive(m)) lib.push(m) }
  out.library = JSON.stringify(lib)
  out.libraryRemoved = JSON.stringify(removed)
  // Reading positions: most recent wins
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)].filter(k => k.startsWith('reading:')))
  for (const k of keys) {
    const a = parse<any>(local[k], null), b = parse<any>(remote[k], null)
    const win = !a ? b : !b ? a : (Number(b.at) || 0) > (Number(a.at) || 0) ? b : a
    if (win) out[k] = JSON.stringify(win)
  }
  // Annotations + deletions
  const aRemoved = mergeTombstones(parse(local.annotationsRemoved, {}), parse(remote.annotationsRemoved, {}))
  const notes = new Map<string, any>()
  for (const a of [...parse<any[]>(local.annotations, []), ...parse<any[]>(remote.annotations, [])]) {
    if (!a || !a.id) continue
    const prev = notes.get(a.id)
    if (!prev || (Number(a.at) || 0) > (Number(prev.at) || 0)) notes.set(a.id, a)
  }
  out.annotations = JSON.stringify([...notes.values()].filter(a => !(aRemoved[a.id] >= (Number(a.at) || 0))))
  out.annotationsRemoved = JSON.stringify(aRemoved)
  // Reading statistics
  const sl: Record<string, any> = parse(local.readingStats, {}), sr: Record<string, any> = parse(remote.readingStats, {})
  const stats: Record<string, { c: number, s: number }> = {}
  for (const day of new Set([...Object.keys(sl), ...Object.keys(sr)])) {
    stats[day] = { c: Math.max(Number(sl[day]?.c) || 0, Number(sr[day]?.c) || 0), s: Math.max(Number(sl[day]?.s) || 0, Number(sr[day]?.s) || 0) }
  }
  out.readingStats = JSON.stringify(stats)
  mergeMedia(local, remote, out)
  return out
}

function mergeMediaItem(local: any, remote: any) {
  const out = { ...local }
  const ep = (x: any) => Array.isArray(x?.episodes) ? x.episodes.length : Number(x?.episodes) || 0
  if (ep(remote) > ep(local)) out.episodes = remote.episodes
  if ((Number(remote.shelfAt) || 0) > (Number(local.shelfAt) || 0)) { out.shelf = remote.shelf; out.shelfAt = remote.shelfAt }
  out.addedAt = Math.max(Number(local.addedAt) || 0, Number(remote.addedAt) || 0) || local.addedAt
  if (!out.thumbnail && remote.thumbnail) out.thumbnail = remote.thumbnail
  return out
}

/** Video libraries, positions and stats (Anime / Series / Movies). */
function mergeMedia(local: SyncData, remote: SyncData, out: SyncData) {
  const removed = mergeTombstones(parse(local.mediaRemoved, {}), parse(remote.mediaRemoved, {}))
  out.mediaRemoved = JSON.stringify(removed)
  for (const key of MEDIA_LIBS) {
    if (local[key] == null && remote[key] == null) continue
    const lLib: any[] = parse(local[key], []), rLib: any[] = parse(remote[key], [])
    const byId = new Map<string, any>(); const order: any[] = []
    for (const a of lLib) if (a && a.id != null) { byId.set(String(a.id), a); order.push(a) }
    const remoteOnly: any[] = []
    for (const a of rLib) {
      if (!a || a.id == null) continue
      const id = String(a.id)
      if (byId.has(id)) byId.set(id, mergeMediaItem(byId.get(id), a)); else { byId.set(id, a); remoteOnly.push(a) }
    }
    const seen = new Set<string>(), lib: any[] = []
    for (const a of [...remoteOnly.sort((x, y) => (Number(y.addedAt) || 0) - (Number(x.addedAt) || 0)), ...order]) {
      const id = String(a.id); if (seen.has(id)) continue; seen.add(id)
      const m = byId.get(id); if (!(removed[key + ':' + id] >= (Number(m.addedAt) || 0))) lib.push(m)
    }
    out[key] = JSON.stringify(lib)
  }
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])
  for (const k of keys) {
    if (k.startsWith('mediapos:') || k.startsWith('lastEpInfo:')) {
      const a = parse<any>(local[k], null), b = parse<any>(remote[k], null)
      const win = !a ? b : !b ? a : (Number(b.at) || 0) > (Number(a.at) || 0) ? b : a
      if (win) out[k] = JSON.stringify(win)
      if (k.startsWith('lastEpInfo:') && win?.url) out['lastEp:' + k.slice('lastEpInfo:'.length)] = String(win.url)
    } else if (k.startsWith('prefServer:') || (k.startsWith('lastEp:') && !keys.has('lastEpInfo:' + k.slice('lastEp:'.length)))) {
      const v = local[k] ?? remote[k]; if (v != null) out[k] = v
    }
  }
  const wl: Record<string, any> = parse(local.watchStats, {}), wr: Record<string, any> = parse(remote.watchStats, {})
  if (Object.keys(wl).length || Object.keys(wr).length) {
    const w: Record<string, { e: number, s: number }> = {}
    for (const day of new Set([...Object.keys(wl), ...Object.keys(wr)])) w[day] = { e: Math.max(Number(wl[day]?.e) || 0, Number(wr[day]?.e) || 0), s: Math.max(Number(wl[day]?.s) || 0, Number(wr[day]?.s) || 0) }
    out.watchStats = JSON.stringify(w)
  }
}

/** Keys whose value differs between two snapshots. */
export function changedKeys(before: SyncData, after: SyncData) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(k => before[k] !== after[k])
}
