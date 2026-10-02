// App appearance: 'system' follows Windows (light/dark), or forced dark/light.
// Applied before the first render to avoid a flash of the wrong theme.
export type ThemePref = 'system' | 'dark' | 'light'

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null
let pref: ThemePref = (() => { try { const v = localStorage.getItem('appTheme'); return v === 'dark' || v === 'light' ? v : 'system' } catch { return 'system' } })()

export const resolvedTheme = (): 'dark' | 'light' => pref === 'system' ? (media?.matches ? 'light' : 'dark') : pref
function apply() { try { document.documentElement.dataset.theme = resolvedTheme() } catch {} }
apply()
media?.addEventListener?.('change', () => { if (pref === 'system') { apply(); window.dispatchEvent(new Event('nr-theme')) } })

export const getThemePref = () => pref
export function setThemePref(p: ThemePref) {
  pref = p
  try { localStorage.setItem('appTheme', p) } catch {}
  apply(); window.dispatchEvent(new Event('nr-theme'))
}
