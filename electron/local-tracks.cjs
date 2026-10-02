// Subtitles for Local Videos.
//
// Chromium's <video> only shows WebVTT added through <track>: it ignores
// subtitles inside MKV files and .srt/.ass files next to the video. This module
// finds both and converts them to WebVTT:
// - files next to the video (or in a Subs/Subtitles folder) whose name starts
//   with the video's name: .srt, .vtt, .ass, .ssa
// - text subtitle tracks inside MKV/WebM files (SRT, ASS/SSA, WebVTT), read
//   with a small Matroska parser (zlib / header-stripping compression handled).
// Picture subtitles (PGS, VobSub) cannot be converted and are listed as such.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SUB_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa'])
const MAX_SUB_FILE = 20 * 1024 * 1024
const TEXT_CODECS = new Set(['S_TEXT/UTF8', 'S_TEXT/ASCII', 'S_TEXT/ASS', 'S_TEXT/SSA', 'S_ASS', 'S_SSA', 'S_TEXT/WEBVTT'])

// ---- Text helpers -------------------------------------------------------------------

function decodeText(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2))
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2))
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '') }
  catch { return new TextDecoder('windows-1252').decode(buf) } // older French/English .srt files
}

const pad = (n, w = 2) => String(n).padStart(w, '0')
function vttTime(ms) {
  ms = Math.max(0, Math.round(ms))
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`
}
const escapeVtt = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** SRT-style text (may contain <i>, <b>, <u>, <font>, {\an8}) -> safe WebVTT cue text. */
function cleanSrtText(text) {
  const keep = []
  let s = text.replace(/\{\\[^}]*\}/g, '').replace(/<(\/?)(i|b|u)>/gi, (_m, close, tag) => { keep.push(`<${close}${tag.toLowerCase()}>`); return `\u0000${keep.length - 1}\u0000` })
  s = escapeVtt(s.replace(/<[^>]*>/g, '')).replace(/\u0000(\d+)\u0000/g, (_m, i) => keep[Number(i)])
  return tidy(s)
}

/** ASS dialogue text -> WebVTT cue text (styling dropped, italics kept, drawings skipped). */
function cleanAssText(text) {
  if (/\{[^}]*\\p[1-9]/.test(text)) return '' // vector drawing, not text
  let italic = false, out = ''
  const parts = text.split(/(\{[^}]*\})/)
  for (const part of parts) {
    if (part.startsWith('{') && part.endsWith('}')) {
      const m = part.match(/\\i([01])(?![0-9])/g)
      if (m) { const on = m[m.length - 1].endsWith('1'); if (on !== italic) { out += on ? '<i>' : '</i>'; italic = on } }
      continue
    }
    out += escapeVtt(part.replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' '))
  }
  if (italic) out += '</i>'
  return tidy(out)
}
const tidy = s => s.split('\n').map(l => l.trim()).filter(Boolean).join('\n').replace(/-->/g, '→').replace(/<i><\/i>/g, '')

function toVtt(cues) {
  cues = cues.filter(c => c.text && c.end > c.start).sort((a, b) => a.start - b.start)
  return 'WEBVTT\n\n' + cues.map(c => `${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text}\n`).join('\n')
}

const srtTime = s => { const m = s.match(/(\d+):(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?/); return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + Number((m[4] || '0').padEnd(3, '0')) : NaN }
const assTime = s => { const m = s.trim().match(/(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?/); return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + Number((m[4] || '0').padEnd(3, '0')) : NaN }

function srtToVtt(text) {
  const cues = []
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n'), i = lines.findIndex(l => l.includes('-->'))
    if (i < 0) continue
    const [a, b] = lines[i].split('-->'), start = srtTime(a), end = srtTime(b)
    if (Number.isFinite(start) && Number.isFinite(end)) cues.push({ start, end, text: cleanSrtText(lines.slice(i + 1).join('\n')) })
  }
  return toVtt(cues)
}

function assToVtt(text) {
  const cues = []
  let format = null, inEvents = false
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    if (/^\[.*\]$/.test(line)) { inEvents = /^\[events\]$/i.test(line); continue }
    if (!inEvents) continue
    if (/^format\s*:/i.test(line)) { format = line.replace(/^format\s*:/i, '').split(',').map(x => x.trim().toLowerCase()); continue }
    if (!/^dialogue\s*:/i.test(line) || !format) continue
    const body = line.replace(/^dialogue\s*:/i, ''), fields = [], n = format.length
    let rest = body
    for (let k = 0; k < n - 1; k++) { const c = rest.indexOf(','); if (c < 0) break; fields.push(rest.slice(0, c)); rest = rest.slice(c + 1) }
    fields.push(rest)
    const get = name => fields[format.indexOf(name)] ?? ''
    const start = assTime(get('start')), end = assTime(get('end'))
    if (Number.isFinite(start) && Number.isFinite(end)) cues.push({ start, end, text: cleanAssText(get('text')) })
  }
  return toVtt(cues)
}

function vttPassThrough(text) {
  text = text.replace(/\r/g, '')
  return /^WEBVTT/.test(text) ? text : 'WEBVTT\n\n' + text
}

// ---- Matroska ---------------------------------------------------------------------------

const ID = {
  EBML: 0x1a45dfa3, Segment: 0x18538067, SeekHead: 0x114d9b74, Seek: 0x4dbb, SeekID: 0x53ab, SeekPosition: 0x53ac,
  Info: 0x1549a966, TimestampScale: 0x2ad7b1, Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7, TrackType: 0x83,
  FlagDefault: 0x88, FlagForced: 0x55aa, CodecID: 0x86, Name: 0x536e, Language: 0x22b59c, LanguageBCP47: 0x22b59d,
  ContentEncodings: 0x6d80, ContentEncoding: 0x6240, ContentCompression: 0x5034, ContentCompAlgo: 0x4254,
  ContentCompSettings: 0x4255, ContentEncryption: 0x5035,
  Cluster: 0x1f43b675, Timestamp: 0xe7, SimpleBlock: 0xa3, BlockGroup: 0xa0, Block: 0xa1, BlockDuration: 0x9b,
  Cues: 0x1c53bb6b, Tags: 0x1254c367, Chapters: 0x1043a770, Attachments: 0x1941a469,
}
const LEVEL1 = new Set([ID.SeekHead, ID.Info, ID.Tracks, ID.Cluster, ID.Cues, ID.Tags, ID.Chapters, ID.Attachments])

async function openReader(file) {
  const fh = await fs.promises.open(file, 'r')
  const size = (await fh.stat()).size
  const CHUNK = 1 << 20
  let buf = Buffer.alloc(0), at = 0
  async function bytes(pos, len) {
    if (pos < at || pos + len > at + buf.length) {
      const want = Math.min(Math.max(len, CHUNK), size - pos)
      const b = Buffer.alloc(Math.max(0, want))
      const { bytesRead } = await fh.read(b, 0, b.length, pos)
      buf = b.subarray(0, bytesRead); at = pos
    }
    return buf.subarray(pos - at, Math.min(buf.length, pos - at + len))
  }
  return { size, bytes, close: () => fh.close() }
}

function vint(b, o, keepMarker) {
  const first = b[o]; if (first === undefined) return null
  let len = 1, mask = 0x80
  while (len <= 8 && !(first & mask)) { len++; mask >>= 1 }
  if (len > 8 || o + len > b.length) return null
  let v = keepMarker ? first : first & (mask - 1), allOnes = (first & (mask - 1)) === mask - 1
  for (let i = 1; i < len; i++) { v = v * 256 + b[o + i]; if (b[o + i] !== 0xff) allOnes = false }
  return { value: v, len, unknown: !keepMarker && allOnes }
}

async function element(r, pos) {
  const b = await r.bytes(pos, 12)
  const id = vint(b, 0, true); if (!id) return null
  const sz = vint(b, id.len, false); if (!sz) return null
  const dataPos = pos + id.len + sz.len
  return { id: id.value, size: sz.unknown ? -1 : sz.value, dataPos, end: sz.unknown ? -1 : dataPos + sz.value }
}

const uint = b => { let v = 0; for (const x of b) v = v * 256 + x; return v }

async function children(r, start, end, fn) {
  let pos = start
  while (pos < end) {
    const el = await element(r, pos); if (!el || el.end < 0 || el.end > end) break
    if (await fn(el) === false) break
    pos = el.end
  }
}

async function parseTracks(r, el) {
  const tracks = []
  await children(r, el.dataPos, el.end, async te => {
    if (te.id !== ID.TrackEntry) return
    const t = { number: 0, type: 0, codec: '', name: '', language: 'eng', default: true, forced: false, compression: null }
    await children(r, te.dataPos, te.end, async f => {
      const len = f.end - f.dataPos
      if (len > 1 << 16 && f.id !== ID.ContentEncodings) return
      const d = Buffer.from(await r.bytes(f.dataPos, Math.min(len, 1 << 16)))
      if (f.id === ID.TrackNumber) t.number = uint(d)
      else if (f.id === ID.TrackType) t.type = uint(d)
      else if (f.id === ID.CodecID) t.codec = d.toString('latin1').replace(/\0+$/, '')
      else if (f.id === ID.Name) t.name = d.toString('utf8').replace(/\0+$/, '')
      else if (f.id === ID.Language && !t.bcp47) t.language = d.toString('latin1').replace(/\0+$/, '')
      else if (f.id === ID.LanguageBCP47) { t.language = d.toString('latin1').replace(/\0+$/, ''); t.bcp47 = true }
      else if (f.id === ID.FlagDefault) t.default = uint(d) === 1
      else if (f.id === ID.FlagForced) t.forced = uint(d) === 1
      else if (f.id === ID.ContentEncodings) t.compression = await parseEncodings(r, f)
    })
    tracks.push(t)
  })
  return tracks
}

async function parseEncodings(r, el) {
  let out = null
  await children(r, el.dataPos, el.end, async enc => {
    if (enc.id !== ID.ContentEncoding) return
    await children(r, enc.dataPos, enc.end, async c => {
      if (c.id === ID.ContentEncryption) out = { encrypted: true }
      if (c.id !== ID.ContentCompression) return
      const comp = { algo: 0, settings: Buffer.alloc(0) }
      await children(r, c.dataPos, c.end, async x => {
        const d = Buffer.from(await r.bytes(x.dataPos, x.end - x.dataPos))
        if (x.id === ID.ContentCompAlgo) comp.algo = uint(d)
        if (x.id === ID.ContentCompSettings) comp.settings = d
      })
      if (!out) out = comp
    })
  })
  return out
}

/** Walk the top level of the Segment; `visit` returns false to stop. */
async function walkSegment(r, visit) {
  let pos = 0
  const head = await element(r, pos)
  if (!head || head.id !== ID.EBML) throw new Error('Not a Matroska/WebM file.')
  pos = head.end
  const seg = await element(r, pos)
  if (!seg || seg.id !== ID.Segment) throw new Error('Not a Matroska/WebM file.')
  const segEnd = seg.size < 0 ? r.size : Math.min(r.size, seg.end)
  pos = seg.dataPos
  while (pos < segEnd) {
    const el = await element(r, pos); if (!el) break
    const res = await visit(el, seg.dataPos, segEnd)
    if (res === false) break
    if (typeof res === 'number') { pos = res; continue } // visitor already consumed the element
    if (el.end < 0) break
    pos = el.end
  }
}

async function readHeaders(r) {
  let tracks = null, scale = 1000000, tracksAt = -1
  await walkSegment(r, async (el, segData) => {
    if (el.id === ID.Info) await children(r, el.dataPos, el.end, async f => { if (f.id === ID.TimestampScale) scale = uint(await r.bytes(f.dataPos, f.end - f.dataPos)) || scale })
    else if (el.id === ID.Tracks) tracks = await parseTracks(r, el)
    else if (el.id === ID.SeekHead) {
      await children(r, el.dataPos, el.end, async s => {
        if (s.id !== ID.Seek) return
        let sid = 0, spos = -1
        await children(r, s.dataPos, s.end, async f => { const d = await r.bytes(f.dataPos, f.end - f.dataPos); if (f.id === ID.SeekID) sid = uint(d); if (f.id === ID.SeekPosition) spos = uint(d) })
        if (sid === ID.Tracks && spos >= 0) tracksAt = segData + spos
      })
    } else if (el.id === ID.Cluster) {
      if (!tracks && tracksAt >= 0) { const t = await element(r, tracksAt); if (t && t.id === ID.Tracks) tracks = await parseTracks(r, t) }
      return false // headers come before the clusters
    }
  })
  return { tracks: tracks || [], scale }
}

const isMatroska = file => /\.(mkv|webm|mka|mk3d)$/i.test(file)

async function embeddedSubtitleTracks(file) {
  if (!isMatroska(file)) return []
  const r = await openReader(file)
  try {
    const { tracks } = await readHeaders(r)
    return tracks.filter(t => t.type === 0x11).map(t => ({
      id: 'mkv:' + t.number, source: 'embedded', label: t.name, lang: t.language === 'und' ? '' : t.language,
      codec: t.codec, default: t.default, forced: t.forced,
      supported: TEXT_CODECS.has(t.codec) && !(t.compression && (t.compression.encrypted || t.compression.algo === 1 || t.compression.algo === 2)),
    }))
  } finally { await r.close() }
}

async function extractEmbedded(file, number) {
  const r = await openReader(file)
  try {
    const { tracks, scale } = await readHeaders(r)
    const track = tracks.find(t => t.number === number && t.type === 0x11)
    if (!track) throw new Error('This subtitle track was not found.')
    if (!TEXT_CODECS.has(track.codec)) throw new Error('These subtitles are pictures and cannot be shown.')
    const comp = track.compression
    if (comp && (comp.encrypted || (comp.algo !== 0 && comp.algo !== 3))) throw new Error('These subtitles use an unsupported compression.')
    const toMs = ts => ts * scale / 1e6
    const blocks = []
    const readBlock = async (el, clusterTs, duration) => {
      const head = await r.bytes(el.dataPos, 8)
      const tn = vint(head, 0, false); if (!tn || tn.value !== number) return
      const raw = Buffer.from(await r.bytes(el.dataPos, el.end - el.dataPos))
      const rel = raw.readInt16BE(tn.len), flags = raw[tn.len + 2]
      if (flags & 0x06) return // laced: never used for subtitles
      let data = raw.subarray(tn.len + 3)
      if (comp && comp.algo === 0) { try { data = zlib.inflateSync(data) } catch { return } }
      if (comp && comp.algo === 3) data = Buffer.concat([comp.settings, data])
      blocks.push({ start: toMs(clusterTs + rel), dur: duration == null ? null : toMs(duration), text: data.toString('utf8').replace(/\0+$/, '') })
    }
    await walkSegment(r, async (el, _segData, segEnd) => {
      if (el.id !== ID.Cluster) return
      const end = el.end < 0 ? segEnd : el.end
      let pos = el.dataPos, ts = 0
      while (pos < end) {
        const c = await element(r, pos); if (!c) return end
        if (el.end < 0 && LEVEL1.has(c.id)) return pos // unknown-size cluster ends at the next top-level element
        if (c.end < 0) return end
        if (c.id === ID.Timestamp) ts = uint(await r.bytes(c.dataPos, c.end - c.dataPos))
        else if (c.id === ID.SimpleBlock) await readBlock(c, ts, null)
        else if (c.id === ID.BlockGroup) {
          let blk = null, dur = null
          await children(r, c.dataPos, c.end, async g => { if (g.id === ID.Block) blk = g; else if (g.id === ID.BlockDuration) dur = uint(await r.bytes(g.dataPos, g.end - g.dataPos)) })
          if (blk) await readBlock(blk, ts, dur)
        }
        pos = c.end
      }
      return end
    })
    blocks.sort((a, b) => a.start - b.start)
    const ass = /ASS|SSA/.test(track.codec)
    const cues = blocks.map((b, i) => {
      const next = blocks[i + 1]
      const end = b.dur != null && b.dur > 0 ? b.start + b.dur : Math.min(b.start + 5000, next ? next.start : b.start + 5000)
      let text = b.text
      if (ass) { let rest = text; for (let k = 0; k < 8; k++) { const c = rest.indexOf(','); if (c < 0) { rest = ''; break } rest = rest.slice(c + 1) } text = cleanAssText(rest) }
      else text = cleanSrtText(text.replace(/\r/g, ''))
      return { start: b.start, end, text }
    })
    return toVtt(cues)
  } finally { await r.close() }
}

// ---- Subtitle files next to the video ------------------------------------------------

const LANG_WORDS = { english: 'en', anglais: 'en', french: 'fr', francais: 'fr', 'français': 'fr', vf: 'fr', vostfr: 'fr', spanish: 'es', espanol: 'es', 'español': 'es', german: 'de', deutsch: 'de', italian: 'it', italiano: 'it', portuguese: 'pt', japanese: 'ja', arabic: 'ar', russian: 'ru', chinese: 'zh', korean: 'ko', dutch: 'nl' }

function describeFileName(rest) {
  // "fr", "en.forced", "French", "2_English", "eng.sdh"
  const tokens = rest.split(/[._\-\s]+/).filter(Boolean)
  let lang = '', forced = false
  const extra = []
  for (const tk of tokens) {
    const l = tk.toLowerCase()
    if (!lang && LANG_WORDS[l]) lang = LANG_WORDS[l]
    else if (!lang && /^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(tk) && !/^(sdh|cc|hi)$/i.test(tk)) lang = l
    else if (l === 'forced') forced = true
    else if (!/^\d+$/.test(tk)) extra.push(tk)
  }
  return { lang, forced, label: extra.join(' ') }
}

async function externalSubtitleFiles(videoFile) {
  const dir = path.dirname(videoFile), base = path.basename(videoFile, path.extname(videoFile)), lower = base.toLowerCase()
  const found = []
  const scan = async (folder, mustMatch) => {
    let entries = []
    try { entries = await fs.promises.readdir(folder, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (!e.isFile() || !SUB_EXT.has(path.extname(e.name).toLowerCase())) continue
      const stem = path.basename(e.name, path.extname(e.name))
      if (mustMatch && !stem.toLowerCase().startsWith(lower)) continue
      const rest = mustMatch ? stem.slice(base.length) : stem
      const d = describeFileName(rest)
      found.push({ id: 'file:' + path.relative(dir, path.join(folder, e.name)), source: 'file', file: e.name, label: d.label, lang: d.lang, forced: d.forced, default: false, codec: path.extname(e.name).slice(1).toLowerCase(), supported: true })
    }
  }
  await scan(dir, true)
  for (const sub of ['Subs', 'Subtitles', 'subs', 'subtitles', 'Sous-titres']) {
    const p = path.join(dir, sub)
    if (!fs.existsSync(p)) continue
    await scan(p, true)
    await scan(path.join(p, base), false) // Subs/<video name>/2_English.srt
  }
  const seen = new Set()
  return found.filter(f => !seen.has(f.id) && seen.add(f.id))
}

async function readExternal(videoFile, rel) {
  const dir = path.dirname(videoFile), full = path.resolve(dir, rel)
  const r = path.relative(dir, full)
  if (!r || r.startsWith('..') || path.isAbsolute(r) || !SUB_EXT.has(path.extname(full).toLowerCase())) throw new Error('This subtitle file is not next to the video.')
  const st = await fs.promises.stat(full)
  if (st.size > MAX_SUB_FILE) throw new Error('The subtitle file is too large.')
  const text = decodeText(await fs.promises.readFile(full))
  const ext = path.extname(full).toLowerCase()
  return ext === '.vtt' ? vttPassThrough(text) : ext === '.srt' ? srtToVtt(text) : assToVtt(text)
}

// ---- Public API ------------------------------------------------------------------------

function createLocalTracks() {
  const cache = new Map()
  async function list(videoFile) {
    const [files, embedded] = await Promise.all([externalSubtitleFiles(videoFile), embeddedSubtitleTracks(videoFile).catch(() => [])])
    return { subtitles: [...embedded, ...files] }
  }
  async function subtitle(videoFile, id) {
    const st = await fs.promises.stat(videoFile)
    const key = videoFile + '|' + st.mtimeMs + '|' + id
    if (cache.has(key)) return cache.get(key)
    let vtt
    if (id.startsWith('mkv:')) vtt = await extractEmbedded(videoFile, Number(id.slice(4)))
    else if (id.startsWith('file:')) vtt = await readExternal(videoFile, id.slice(5))
    else throw new Error('Unknown subtitle track.')
    cache.set(key, vtt)
    if (cache.size > 12) cache.delete(cache.keys().next().value)
    return vtt
  }
  return { list, subtitle }
}

module.exports = { createLocalTracks, srtToVtt, assToVtt, cleanAssText, cleanSrtText, describeFileName }
