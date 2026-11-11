import React, { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { lsGet, lsSet, timeAgo } from '../lib/util'
import { mergeSync, pickSynced, changedKeys } from '../lib/syncMerge'
import { NoticeText } from '../ui/common'
import { PcLinkSettings } from './pc-link'

// ---- Folder sync controller (renderer) ----------------------------------------------
// Pull the copy in the synced folder, merge it with this PC, apply the changes
// here, then write the merged result back. Runs at startup, every 2 minutes,
// shortly after library/annotation changes and when the window is hidden.

type SyncState = { status: SyncStatus | null, running: boolean, lastAt: number, lastFrom: string, error: string }

function localSnapshot(): Record<string, string> {
  const all: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; all[k] = localStorage.getItem(k) || '' }
  return pickSynced(all)
}

export function useFolderSync({ library, onLibrary }: { library: any[], onLibrary: (lib: any[]) => void }) {
  const [st, setSt] = useState<SyncState>({ status: null, running: false, lastAt: Number(lsGet('syncLastAt')) || 0, lastFrom: lsGet('syncLastFrom') || '', error: '' })
  const busy = useRef(false), onLibraryRef = useRef(onLibrary)
  onLibraryRef.current = onLibrary
  const api = (window as any).novelReader
  const refreshStatus = async () => { try { const s = await api.syncStatus?.(); if (s) setSt(x => ({ ...x, status: s })); return s } catch { return null } }

  const syncNow = async () => {
    if (busy.current || !api.syncRead) return
    // Always ask the main process: the folder may have just been chosen.
    const status = await refreshStatus()
    if (!status?.enabled) return
    busy.current = true; setSt(x => ({ ...x, running: true, error: '' }))
    try {
      let remote: any = null, readError = ''
      try { remote = await api.syncRead() } catch (e: any) { readError = String(e?.message || e) }
      const local = localSnapshot()
      const merged = remote ? mergeSync(local, remote.data) : local
      const changed = changedKeys(local, merged)
      for (const k of changed) { if (merged[k] == null) localStorage.removeItem(k); else lsSet(k, merged[k]) }
      if (changed.includes('library')) onLibraryRef.current(JSON.parse(merged.library || '[]'))
      if (changed.includes('annotations')) window.dispatchEvent(new Event('nr-annotations'))
      if (changed.some(k => ['animeLibrary', 'seriesLibrary', 'movieLibrary'].includes(k) || k.startsWith('mediapos:') || k.startsWith('lastEpInfo:'))) window.dispatchEvent(new Event('nr-media-synced'))
      await api.syncWrite(merged)
      const from = remote && remote.deviceId !== status.deviceId ? remote.deviceName : ''
      const at = Date.now(); lsSet('syncLastAt', String(at)); if (from) lsSet('syncLastFrom', from)
      setSt(x => ({ ...x, running: false, lastAt: at, lastFrom: from || x.lastFrom, error: readError }))
      refreshStatus()
    } catch (e: any) {
      setSt(x => ({ ...x, running: false, error: String(e?.message || e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '') }))
    } finally { busy.current = false }
  }
  const syncRef = useRef(syncNow); syncRef.current = syncNow

  useEffect(() => {
    refreshStatus().then(s => { if (s?.enabled) setTimeout(() => syncRef.current(), 1500) })
    const iv = setInterval(() => syncRef.current(), 120_000)
    const onHide = () => { if (document.visibilityState === 'hidden') syncRef.current() }
    document.addEventListener('visibilitychange', onHide)
    const onNotes = () => { clearTimeout((onNotes as any).tm); (onNotes as any).tm = setTimeout(() => syncRef.current(), 10_000) }
    window.addEventListener('nr-annotations', onNotes)
    window.addEventListener('nr-media-changed', onNotes)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('nr-annotations', onNotes); window.removeEventListener('nr-media-changed', onNotes) }
  }, [])
  // Push shortly after library changes (adds, removals, shelves, new chapters).
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } const tm = setTimeout(() => syncRef.current(), 10_000); return () => clearTimeout(tm) }, [library])

  const choose = async (create?: any) => { try { const s = await api.syncChoose(create === true); setSt(x => ({ ...x, status: s, error: '' })); if (s?.enabled) await syncRef.current() } catch (e: any) { setSt(x => ({ ...x, error: String(e?.message || e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '') })) } }
  const disable = async () => { const s = await api.syncDisable(); setSt(x => ({ ...x, status: s })) }
  return { ...st, syncNow, choose, disable }
}

export type FolderSync = ReturnType<typeof useFolderSync>

export function SyncSettings({ sync }: { sync: FolderSync }) {
  const s = sync.status
  // Phone / tablet: directly with the linked PC (home Wi-Fi), or through the file the
  // PC wrote in Google Drive / OneDrive (Android has no shared folders: the file is picked).
  if (document.documentElement.classList.contains('android')) {
    const ios = document.documentElement.classList.contains('ios')
    if (ios || !s?.enabled || s.direct) return <><PcLinkSettings sync={sync} />
      {!ios && !s?.enabled && <section className="panel settings-block sync-file"><h2>{t('Or through Google Drive / OneDrive')}</h2>
        <p className="settings-help">{t('Works away from home too. On the PC, turn on sync in Settings with a Google Drive or OneDrive folder. Then choose here the file library-sync.json it wrote in the NovelReader folder.')}</p>
        <div className="libraryactions"><button onClick={() => sync.choose()}>{t('Choose the sync file…')}</button><button onClick={() => sync.choose(true)}>{t('No PC yet: create the file…')}</button></div>
        {sync.error && <div className="anime-toast error" role="alert"><NoticeText text={t(sync.error)} /></div>}
      </section>}</>
    return <section className="panel settings-block"><h2>{t('Sync with your PC')}</h2>
      <p className="settings-help sync-line"><b>{t('File:')}</b> <code>{s.file}</code></p>
      <p className="settings-help sync-line">{sync.running ? <><span className="spinner" aria-hidden="true" />{t('Syncing…')}</> : sync.lastAt ? t('Last synced {when}.', { when: timeAgo(sync.lastAt) }) : t('Not synced yet.')}{s.remote && s.remote.deviceId !== s.deviceId ? ' ' + t('Latest changes from {pc}, {when}.', { pc: s.remote.deviceName, when: timeAgo(s.remote.at) }) : ''}</p>
      <div className="libraryactions"><button className="primary" disabled={sync.running} onClick={sync.syncNow}>{t('Sync now')}</button><button onClick={() => sync.choose()}>{t('Change file…')}</button><button onClick={sync.disable}>{t('Stop syncing')}</button></div>
      {sync.error && <div className="anime-toast error" role="alert"><NoticeText text={t(sync.error)} /></div>}
    </section>
  }
  return <section className="panel settings-block"><h2>{t('Sync between PCs')}</h2>
    <p className="settings-help">{t('Choose a folder that your cloud service keeps in sync (OneDrive, Google Drive, Dropbox…). NovelReader keeps your library, reading positions, bookmarks, notes, anime, series, movies and where you stopped watching there, and merges the changes made on each PC. Preferences such as theme and language stay on each PC.')}</p>
    {!s?.enabled ? <div className="libraryactions"><button className="primary" onClick={sync.choose}>{t('Choose a synced folder…')}</button></div> : <>
      <p className="settings-help sync-line">{s.direct ? t('Shared directly with your phone (Phone link below). Choose a folder to also sync between PCs or away from home.') : <><b>{t('Folder:')}</b> <code>{s.folder}</code></>}</p>
      <p className="settings-help sync-line">{sync.running ? <><span className="spinner" aria-hidden="true" />{t('Syncing…')}</> : sync.lastAt ? t('Last synced {when}.', { when: timeAgo(sync.lastAt) }) : t('Not synced yet.')}{s.remote && s.remote.deviceId !== s.deviceId ? ' ' + t('Latest changes from {pc}, {when}.', { pc: s.remote.deviceName, when: timeAgo(s.remote.at) }) : ''}</p>
      <div className="libraryactions"><button className="primary" disabled={sync.running} onClick={sync.syncNow}>{t('Sync now')}</button><button onClick={sync.choose}>{s.direct ? t('Choose a synced folder…') : t('Change folder…')}</button>{!s.direct && <button onClick={sync.disable}>{t('Stop syncing')}</button>}</div>
    </>}
    {sync.error && <div className="anime-toast error" role="alert"><NoticeText text={t(sync.error)} /></div>}
  </section>
}
