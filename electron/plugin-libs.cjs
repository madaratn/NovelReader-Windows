// The "@libs/…" modules LNReader gives to its book sources, as the sources expect
// them (lnreader-plugins/src/libs). Shared by the PC runner (plugin-runner.cjs) and,
// as a copy in TypeScript, by the Android one (src/platform/plugin-libs.ts).

// Values of LNReader's FilterTypes: sources declare their filters with them when
// they are loaded, so without them they cannot even start.
const FilterTypes = { TextInput: 'Text', Picker: 'Picker', CheckboxGroup: 'Checkbox', Switch: 'Switch', ExcludableCheckboxGroup: 'XCheckbox' }
const NovelStatus = { Unknown: 'Unknown', Ongoing: 'Ongoing', Completed: 'Completed', Licensed: 'Licensed', PublishingFinished: 'Publishing Finished', Cancelled: 'Cancelled', OnHiatus: 'On Hiatus', Inactive: 'Inactive' }

// A source's own small store (logins, tokens, settings): kept per source while the
// app runs. get / set / delete as in LNReader; getItem / setItem kept for older sources.
function makeStorage() {
  const m = new Map()
  const live = k => { const x = m.get(k); if (!x) return undefined; if (x.expires && Date.now() > x.expires) { m.delete(k); return undefined } return x }
  const storage = {
    set: (key, value, expires) => { m.set(String(key), { value, expires: expires instanceof Date ? expires.getTime() : (typeof expires === 'number' ? expires : undefined) }) },
    get: (key, raw) => { const x = live(String(key)); return raw ? x : x && x.value },
    getAllKeys: () => Array.from(m.keys()).filter(k => live(k)),
    delete: key => { m.delete(String(key)) },
    clearAll: () => m.clear(),
    getItem: async key => { const x = live(String(key)); return x ? x.value : null },
    setItem: async (key, value) => { m.set(String(key), { value }) },
  }
  const web = { get: () => undefined, getItem: () => null, setItem: () => {} }
  return { storage, localStorage: web, sessionStorage: web }
}
// @libs/aes (LNReader re-exports gcm from @noble/ciphers) and @/types/constants.
let aes = {}
try { aes = { gcm: require('@noble/ciphers/aes').gcm } } catch {}
const constants = { NovelStatus: { ...NovelStatus, STUB: 'STUB' }, defaultCover: '' }
module.exports = { FilterTypes, NovelStatus, makeStorage, aes, constants }

// Genre filter of an LNReader source, when it has one: a picker or a list of boxes
// whose name says genre / tag / category. -> {key, type, options:[{label,value}]}
function genreFilter(filters) {
  let best = null
  for (const [key, f] of Object.entries(filters || {})) {
    if (!f || typeof f !== 'object' || !Array.isArray(f.options) || f.options.length < 3) continue
    const name = (key + ' ' + (f.label || '')).toLowerCase()
    if (!/genre|tag|categor|género|catégorie|kategorie|жанр/.test(name)) continue
    if (!['Picker', 'Checkbox', 'XCheckbox'].includes(f.type)) continue
    const options = f.options.map(o => ({ label: String(o.label ?? o.name ?? o.value ?? ''), value: o.value ?? o.label })).filter(o => o.label && o.value !== '' && o.value != null && !/^(all|any|tous|todos|none|-)$/i.test(o.label))
    if (options.length < 3) continue
    const score = (/genre/.test(name) ? 2 : 0) + (f.type === 'Picker' ? 0 : 1)
    if (!best || score > best.score) best = { key, type: f.type, options, score }
  }
  return best && { key: best.key, type: best.type, options: best.options }
}
// The source's filters with one genre chosen.
function withGenre(filters, gf, value) {
  if (!gf || value == null || value === '') return filters
  const v = gf.type === 'Picker' ? value : gf.type === 'Checkbox' ? [value] : { include: [value], exclude: [] }
  return { ...filters, [gf.key]: { type: gf.type, value: v } }
}
module.exports.genreFilter = genreFilter
module.exports.withGenre = withGenre
