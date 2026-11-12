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
