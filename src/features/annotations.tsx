import React, { useEffect, useRef, useState } from 'react'
import { t, plural } from '../i18n'
import { readableBlocks } from './reader'
import { lsGet, lsSet, timeAgo } from '../lib/util'

// ---- Bookmarks, highlights and notes -------------------------------------------------
// Stored in localStorage ('annotations'), so they are included in backups and
// folder sync. Highlights are anchored to a paragraph (index among readable
// blocks) and character offsets inside it, and painted with the CSS Custom
// Highlight API: the chapter HTML is never modified.

export type HighlightColor = 'yellow' | 'green' | 'pink'
export type Annotation = {
  id: string, novelId: string, novelName: string,
  chapterPath: string, chapterIndex: number, chapterTitle: string,
  kind: 'bookmark' | 'highlight', para: number, start?: number, end?: number,
  text: string, note?: string, color?: HighlightColor, at: number
}
export const HL_COLORS: HighlightColor[] = ['yellow', 'green', 'pink']
const EVENT = 'nr-annotations'

export function readAnnotations(): Annotation[] { try { const x = JSON.parse(lsGet('annotations') || '[]'); return Array.isArray(x) ? x : [] } catch { return [] } }
function write(list: Annotation[]) { lsSet('annotations', JSON.stringify(list)); window.dispatchEvent(new Event(EVENT)) }
export function addAnnotation(a: Omit<Annotation, 'id' | 'at'>): Annotation {
  const full: Annotation = { ...a, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), at: Date.now() }
  write([...readAnnotations(), full]); return full
}
export function updateAnnotation(id: string, patch: Partial<Annotation>) { write(readAnnotations().map(a => a.id === id ? { ...a, ...patch, at: Date.now() } : a)) }
export function removeAnnotation(id: string) {
  write(readAnnotations().filter(a => a.id !== id))
  // Tombstone so folder sync does not bring it back from another PC.
  let gone: Record<string, number> = {}; try { gone = JSON.parse(lsGet('annotationsRemoved') || '{}') || {} } catch {}
  gone[id] = Date.now(); lsSet('annotationsRemoved', JSON.stringify(gone))
}
export function useAnnotations(): Annotation[] {
  const [list, setList] = useState<Annotation[]>(readAnnotations)
  useEffect(() => { const on = () => setList(readAnnotations()); window.addEventListener(EVENT, on); window.addEventListener('storage', on); return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on) } }, [])
  return list
}

// Character offsets of a range inside a paragraph.
function anchorFromSelection(root: HTMLElement): { para: number, start: number, end: number, text: string } | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null
  const r = sel.getRangeAt(0)
  if (!root.contains(r.commonAncestorContainer)) return null
  const blocks = readableBlocks(root)
  const para = blocks.findIndex(b => b.contains(r.startContainer))
  if (para < 0) return null
  const block = blocks[para]
  const pre = document.createRange(); pre.selectNodeContents(block); pre.setEnd(r.startContainer, r.startOffset)
  const start = pre.toString().length
  const full = block.textContent || ''
  const end = Math.min(full.length, start + r.toString().length) // a selection spanning paragraphs is clipped to the first one
  const text = full.slice(start, end)
  return text.trim() ? { para, start, end, text } : null
}

export function rangeFromAnchor(root: HTMLElement, a: { para: number, start?: number, end?: number, text: string }): Range | null {
  const blocks = readableBlocks(root)
  let block = blocks[a.para], start = a.start ?? 0, end = a.end ?? 0
  // If the source changed the chapter a little, find the quote again.
  if (!block || (block.textContent || '').slice(start, end) !== a.text) {
    const found = blocks.findIndex(b => (b.textContent || '').includes(a.text))
    if (found < 0) return null
    block = blocks[found]; start = (block.textContent || '').indexOf(a.text); end = start + a.text.length
  }
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let pos = 0, node: Node | null, range = document.createRange(), started = false
  while ((node = walker.nextNode())) {
    const len = (node.textContent || '').length
    if (!started && start <= pos + len) { range.setStart(node, start - pos); started = true }
    if (started && end <= pos + len) { range.setEnd(node, end - pos); return range }
    pos += len
  }
  return null
}

/** Paints the highlights of the current chapter. */
export function ChapterHighlights({ rootRef, novelId, chapterPath, contentKey }: { rootRef: React.RefObject<HTMLElement | null>, novelId: string, chapterPath: string, contentKey: string }) {
  const list = useAnnotations()
  useEffect(() => {
    const hl = (window as any).CSS?.highlights, Highlight = (window as any).Highlight
    const root = rootRef.current
    if (!hl || !Highlight || !root) return
    const mine = list.filter(a => a.kind === 'highlight' && a.novelId === novelId && a.chapterPath === chapterPath)
    for (const c of HL_COLORS) {
      const ranges = mine.filter(a => (a.color || 'yellow') === c).map(a => rangeFromAnchor(root, a)).filter(Boolean) as Range[]
      if (ranges.length) hl.set('nr-hl-' + c, new Highlight(...ranges)); else hl.delete('nr-hl-' + c)
    }
    return () => { for (const c of HL_COLORS) hl.delete('nr-hl-' + c) }
  }, [list, novelId, chapterPath, contentKey])
  return null
}

/** Floating bar shown over a text selection in the chapter. */
export function SelectionToolbar({ rootRef, ctx }: { rootRef: React.RefObject<HTMLElement | null>, ctx: { novelId: string, novelName: string, chapterPath: string, chapterIndex: number, chapterTitle: string } }) {
  const [pos, setPos] = useState<{ x: number, y: number } | null>(null), [noting, setNoting] = useState(false), [note, setNote] = useState(''), [saved, setSaved] = useState('')
  const anchor = useRef<ReturnType<typeof anchorFromSelection>>(null), bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current; if (!root) return
    const check = () => setTimeout(() => {
      const a = anchorFromSelection(root)
      if (!a) { if (!bar.current?.contains(document.activeElement)) { setPos(null); setNoting(false) } return }
      anchor.current = a
      const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
      setPos({ x: Math.min(window.innerWidth - 170, Math.max(170, r.left + r.width / 2)), y: Math.max(70, r.top) })
    }, 10)
    const hide = () => { if (!noting) setPos(null) }
    root.addEventListener('mouseup', check); root.addEventListener('keyup', check)
    window.addEventListener('scroll', hide, { passive: true })
    return () => { root.removeEventListener('mouseup', check); root.removeEventListener('keyup', check); window.removeEventListener('scroll', hide) }
  }, [rootRef, noting])
  useEffect(() => { if (!saved) return; const tm = setTimeout(() => setSaved(''), 1800); return () => clearTimeout(tm) }, [saved])
  const save = (color: HighlightColor, withNote?: string) => {
    const a = anchor.current; if (!a) return
    addAnnotation({ ...ctx, kind: 'highlight', para: a.para, start: a.start, end: a.end, text: a.text.slice(0, 1000), color, note: withNote?.trim() || undefined })
    window.getSelection()?.removeAllRanges(); setPos(null); setNoting(false); setNote(''); setSaved(withNote ? t('Note saved') : t('Highlighted'))
  }
  return <>
    {pos && <div className="selbar" ref={bar} style={{ left: pos.x, top: pos.y }} role="toolbar" aria-label={t('Highlight')} onMouseDown={e => { if (!(e.target as HTMLElement).closest('textarea')) e.preventDefault() }}>
      {!noting ? <>
        {HL_COLORS.map(c => <button key={c} className={'selcolor c-' + c} aria-label={t('Highlight') + ' (' + t(c) + ')'} title={t('Highlight')} onClick={() => save(c)} />)}
        <button className="seltext" onClick={() => setNoting(true)}>{t('Add a note…')}</button>
      </> : <div className="selnote">
        <textarea autoFocus value={note} placeholder={t('Your note')} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save('yellow', note); if (e.key === 'Escape') { setNoting(false); setPos(null) } }} />
        <div><button onClick={() => { setNoting(false) }}>{t('Cancel')}</button><button className="primary" onClick={() => save('yellow', note)}>{t('Save')}</button></div>
      </div>}
    </div>}
    {saved && <div className="selsaved" role="status">{saved}</div>}
  </>
}

/** Bookmark the paragraph at the top of the screen. */
export function addBookmarkHere(root: HTMLElement | null, ctx: { novelId: string, novelName: string, chapterPath: string, chapterIndex: number, chapterTitle: string }) {
  const blocks = readableBlocks(root)
  let para = blocks.findIndex(b => b.getBoundingClientRect().bottom > 120)
  if (para < 0) para = 0
  const text = (blocks[para]?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
  return addAnnotation({ ...ctx, kind: 'bookmark', para, text })
}

/** All bookmarks, highlights and notes, grouped by novel. */
export function NotesPage({ onOpen, inLibrary, initialNovel }: { onOpen: (a: Annotation) => void, inLibrary: (novelId: string) => boolean, initialNovel?: string }) {
  const list = useAnnotations()
  const [q, setQ] = useState(''), [kind, setKind] = useState<'all' | 'bookmark' | 'highlight'>('all'), [editing, setEditing] = useState<string | null>(null), [draft, setDraft] = useState('')
  const [novel, setNovel] = useState(initialNovel || '')
  const needle = q.trim().toLowerCase()
  const shown = list.filter(a => (kind === 'all' || a.kind === kind) && (!novel || a.novelId === novel) && (!needle || (a.text + ' ' + (a.note || '') + ' ' + a.novelName + ' ' + a.chapterTitle).toLowerCase().includes(needle)))
  const groups = new Map<string, Annotation[]>()
  for (const a of shown) { if (!groups.has(a.novelId)) groups.set(a.novelId, []); groups.get(a.novelId)!.push(a) }
  for (const g of groups.values()) g.sort((x, y) => x.chapterIndex - y.chapterIndex || x.para - y.para)
  const novelName = novel ? list.find(a => a.novelId === novel)?.novelName : ''
  return <>
    <header><div><h1>{t('Bookmarks & notes')}</h1><p>{plural(list.length, '{n} saved passage', '{n} saved passages')}</p></div></header>
    {list.length === 0 ? <section className="panel lib-empty"><h2>{t('Nothing saved yet')}</h2><p>{t('While reading, select text to highlight it or add a note, or press the bookmark button to remember a place. Everything appears here.')}</p></section> : <>
      <div className="lib-toolbar"><div className="searchbar"><input placeholder={t('Search your notes…')} value={q} onChange={e => setQ(e.target.value)} aria-label={t('Search your notes…')} /></div></div>
      <div className="shelftabs" role="tablist">{([['all', t('All')], ['highlight', t('Highlights & notes')], ['bookmark', t('Bookmarks')]] as [any, string][]).map(([id, label]) => <button key={id} role="tab" aria-selected={kind === id} className={'shelftab' + (kind === id ? ' on' : '')} onClick={() => setKind(id)}>{label} <small>{list.filter(a => id === 'all' || a.kind === id).length}</small></button>)}
        {novel && <button className="chip on notes-filter" onClick={() => setNovel('')}>{novelName} ×</button>}</div>
      {shown.length === 0 ? <section className="panel"><p>{t('No saved passage matches.')}</p></section> : [...groups.entries()].map(([id, items]) => <section className="panel notesgroup" key={id}>
        <h2>{items[0].novelName} <small>{items.length}</small></h2>
        <ul className="noteslist">{items.map(a => <li key={a.id} className={'noteitem ' + a.kind}>
          <div className="notemeta"><span className={a.kind === 'bookmark' ? 'notekind bm' : 'notekind c-' + (a.color || 'yellow')} aria-hidden="true">{a.kind === 'bookmark' ? '🔖' : ''}</span><small>{a.chapterTitle} · {timeAgo(a.at)}</small></div>
          <blockquote>{a.text}</blockquote>
          {editing === a.id ? <div className="selnote inline"><textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)} placeholder={t('Your note')} /><div><button onClick={() => setEditing(null)}>{t('Cancel')}</button><button className="primary" onClick={() => { updateAnnotation(a.id, { note: draft.trim() || undefined }); setEditing(null) }}>{t('Save')}</button></div></div>
            : a.note ? <p className="notetext">{a.note}</p> : null}
          <div className="noteactions">
            <button className="primary" disabled={!inLibrary(a.novelId)} title={inLibrary(a.novelId) ? undefined : t('This novel is no longer in your library')} onClick={() => onOpen(a)}>{t('Open')}</button>
            {a.kind === 'highlight' && editing !== a.id && <button onClick={() => { setEditing(a.id); setDraft(a.note || '') }}>{a.note ? t('Edit note') : t('Add a note…')}</button>}
            <button className="removebtn" onClick={() => removeAnnotation(a.id)}>{t('Delete')}</button>
          </div>
        </li>)}</ul>
      </section>)}
    </>}
  </>
}

/** Reader toolbar button: bookmark the current place. */
export function BookmarkButton({ rootRef, ctx }: { rootRef: React.RefObject<HTMLElement | null>, ctx: { novelId: string, novelName: string, chapterPath: string, chapterIndex: number, chapterTitle: string } }) {
  const list = useAnnotations(), [flash, setFlash] = useState(false)
  const has = list.some(a => a.kind === 'bookmark' && a.novelId === ctx.novelId && a.chapterPath === ctx.chapterPath)
  useEffect(() => { if (!flash) return; const tm = setTimeout(() => setFlash(false), 1600); return () => clearTimeout(tm) }, [flash])
  return <>
    <button className={'themebtn bm-toggle' + (has ? ' on' : '')} title={t('Bookmark this place')} aria-label={t('Bookmark this place')} onClick={() => { addBookmarkHere(rootRef.current, ctx); setFlash(true) }}>🔖</button>
    {flash && <div className="selsaved" role="status">{t('Bookmark added')}</div>}
  </>
}
