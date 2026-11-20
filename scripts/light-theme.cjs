// Generates the light theme from the (dark) stylesheet: every rule that uses
// a color gets a copy scoped to :root[data-theme=light] with the colors
// remapped by role. Used by vite.config.ts at build/dev time, so the light
// theme follows style.css automatically.
//
// The copies weigh exactly what the rules they are made from weigh (their scope is
// inside :where(), which adds nothing), and they carry every declaration of the
// families they touch (border, outline, background, shadow, colour), "none" and "0"
// included. They come after the whole style sheet, in the same order: so the copy of
// the rule that wins in the dark theme wins in the light one, for the same reasons.
// (Copies used to weigh more than their rule and to leave "border:0" out: a border
// taken away by a later rule came back in the light theme only.)
//
// Roles: backgrounds (dark -> light surfaces, keeping their hierarchy),
// text (light -> dark, never lighter than a readable grey), borders (dark ->
// light greys), shadows (softened). Accent colors keep their hue. The novel
// reader has its own themes and is left untouched.

// (:where(...) is the base layer of style.css: tokens only, and a scoped copy would outweigh the rules meant to win over it.
//  :fullscreen is the video player in full screen, and .player-skip, .po-… what is drawn over the
//  picture: dark whatever the theme, their tokens are set to the dark values in style.css.)
const EXCLUDE = /\.readerpage|\.readercontent|rtheme|::highlight|\.sw-|\.readerbar|tts-current|@keyframes|\.libcover|\.stats-fill|:where\(|:fullscreen|\.player-skip|\.player-next|\.player-skipped|\.seek-flash|\.mini-bar|\.po-|\.cast-panel|\.cast-vol/

function parseColor(c) {
  c = c.trim().toLowerCase()
  let m
  if ((m = c.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('')
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
  }
  if ((m = c.match(/^rgba?\(([^)]+)\)$/))) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  return null
}
const toHex = ({ r, g, b, a }) => {
  const h = v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return a < 1 ? `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+a.toFixed(3)})` : `#${h(r)}${h(g)}${h(b)}`
}
function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s, l }
}
function fromHsl({ h, s, l }, a = 1) {
  const k = n => (n + h / 30) % 12, A = s * Math.min(l, 1 - l)
  const f = n => l - A * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a }
}
const lum = ({ r, g, b }) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
const relLum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
const contrastOnWhite = c => 1.05 / (relLum(c) + 0.05)
const contrastOn = (c, bg) => (relLum(bg) + 0.05) / (relLum(c) + 0.05)
const SURFACE = { r: 0xe2, g: 0xe5, b: 0xee } // the darkest light surface under text

function role(prop) {
  // Design tokens (top of style.css) are named after their role.
  if (/^--text-/.test(prop) || prop === '--text') return 'text'
  if (/^--line(-|$)/.test(prop)) return 'border'
  if (/^--bg-/.test(prop)) return 'bg'
  if (/^(color|fill|accent-color|--muted|--focus|caret-color|text-decoration-color)$/.test(prop)) return 'text'
  if (/^(border|outline)|^--side-border|^--media-line|border-top-color|border-color/.test(prop)) return 'border'
  if (/box-shadow|text-shadow/.test(prop)) return 'shadow'
  if (/^background(-|$)|^--side-bg|^--side-hover|^--media-card|^--accent-soft/.test(prop)) return 'bg'
  return null
}

function mapColor(c, kind) {
  const col = parseColor(c); if (!col) return c
  const { h, s, l } = toHsl(col), L = lum(col), neutral = s < 0.22 || l > 0.9 || l < 0.12 && s < 0.45
  if (kind === 'shadow') {
    if (L < 0.1) return toHex({ r: 20, g: 22, b: 40, a: Math.min(0.18, col.a * 0.35) })
    return toHex(fromHsl({ h, s, l: Math.min(0.62, l) }, col.a)) // focus rings etc.: darker accent
  }
  if (kind === 'bg') {
    if (col.r === 0 && col.g === 0 && col.b === 0 && col.a === 1) return c // video backgrounds stay black
    if (col.a < 1 && L < 0.1) return col.a > 0.8 ? 'rgba(255,255,255,0.92)' : toHex({ r: 20, g: 22, b: 35, a: 0.32 }) // overlays
    if (L > 0.3 || (s > 0.5 && L > 0.18)) return c // accents (primary buttons), yellows, light surfaces
    if (!neutral) return toHex(fromHsl({ h, s: Math.min(0.75, Math.max(0.35, s)), l: 0.94 })) // tinted surfaces: chips, toasts, badges
    const nl = L <= 0.05 ? 0.955 : L <= 0.085 ? 1 : L <= 0.105 ? 0.965 : L <= 0.14 ? 0.93 : 0.9
    return toHex(fromHsl({ h, s: Math.min(s, 0.25), l: nl }, col.a))
  }
  if (kind === 'border') {
    if (col.a < 1 && L > 0.9) return toHex({ r: 0, g: 0, b: 0, a: Math.min(0.2, col.a) })
    if (L >= 0.3 && !neutral) return c // accent borders
    if (!neutral) return toHex(fromHsl({ h, s: Math.min(0.6, Math.max(0.3, s)), l: 0.74 }))
    return toHex(fromHsl({ h, s: Math.min(s, 0.18), l: Math.max(0.72, 0.86 - Math.max(0, L - 0.15) * 0.6) }, col.a))
  }
  if (kind === 'text') {
    if (L < 0.25) return c // already dark (text on yellow highlights, sepia)
    // WCAG AAA: 7:1 against the darkest light surface text sits on (chips, kbd, active rows).
    const darkEnough = (sat, l0) => { let nl = l0, out = fromHsl({ h, s: sat, l: nl }, col.a); while (contrastOn(out, SURFACE) < 7.1 && nl > 0.05) { nl -= 0.01; out = fromHsl({ h, s: sat, l: nl }, col.a) } return toHex(out) }
    if (neutral) return darkEnough(Math.min(s, 0.2), Math.min(0.42, 0.06 + (1 - L) * 0.9))
    if (h >= 235 && h <= 275) return col.a < 1 ? toHex({ r: 66, g: 50, b: 176, a: col.a }) : '#4232b0' // brand violet (7.5:1 on its tint)
    return darkEnough(Math.max(0.45, Math.min(0.7, s)), 0.42)
  }
  return c
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g

function onAccentBackground(decls) {
  const m = decls.match(/(?:^|;)\s*background(?:-color)?\s*:([^;]+)/i)
  if (!m) return false
  if (/var\(--accent/.test(m[1])) return true
  const c = (m[1].match(COLOR_RE) || [])[0]; COLOR_RE.lastIndex = 0
  const col = c && parseColor(c); if (!col) return false
  const { s } = toHsl(col); return (lum(col) > 0.3 && s > 0.3) || (lum(col) > 0.18 && s > 0.5)
}

function transformDecls(decls) {
  // Every declaration of the colour families is re-emitted (mapped or not, "none" and
  // "0" too) so the copies keep the same precedence between themselves as the originals.
  // ("all:unset" is not copied: it would undo, in the light theme only, what later rules
  // of the same weight add. A rule that resets everything must outweigh the rules it
  // undoes, as .engine-row button.help-more does, and then it wins in both themes.)
  const keepWhite = onAccentBackground(decls)
  const out = decls.split(';').map(d => {
    const i = d.indexOf(':'); if (i < 0) return null
    const prop = d.slice(0, i).trim().toLowerCase(), val = d.slice(i + 1).trim()
    if (!prop || !val) return null
    const r = role(prop); if (!r) return null
    COLOR_RE.lastIndex = 0
    const nv = val.replace(COLOR_RE, m => (r === 'text' && keepWhite && lum(parseColor(m) || { r: 0, g: 0, b: 0 }) > 0.9) ? m : mapColor(m, r))
    return `${prop}:${nv}`
  }).filter(Boolean)
  return out.length ? out.join(';') : null
}

// The tokens (on :root) must outweigh the dark ones; every other copy weighs what its
// rule weighs. ("html.android .x" is the root element itself with a class: the theme is
// read on it, not on a parent of it.)
const scope = sel => sel.split(',').map(s => {
  s = s.trim()
  if (s === ':root' || s === 'html') return ':root[data-theme=light]'
  if (/^:root/.test(s)) return s.replace(/^:root/, ':root[data-theme=light]')
  if (/^html(?![\w-])/.test(s)) return s.replace(/^html/, 'html:where([data-theme=light])')
  return ':where(:root[data-theme=light]) ' + s
}).join(',')

function walk(css) {
  let out = '', i = 0
  css = css.replace(/\/\*[\s\S]*?\*\//g, '')
  while (i < css.length) {
    const open = css.indexOf('{', i); if (open < 0) break
    const head = css.slice(i, open).trim()
    // find the matching closing brace
    let depth = 1, j = open + 1
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++ }
    const body = css.slice(open + 1, j - 1)
    if (head.startsWith('@media') || head.startsWith('@supports')) {
      const inner = walk(body); if (inner) out += `${head}{${inner}}\n`
    } else if (!head.startsWith('@') && !EXCLUDE.test(head)) {
      const d = transformDecls(body); if (d) out += `${scope(head)}{${d}}\n`
    }
    i = j
  }
  return out
}

function lightTheme(css) {
  return '\n/* ---- Light theme (generated from the rules above by scripts/light-theme.cjs) ---- */\n'
    + ':root[data-theme=light]{color-scheme:light;--accent:#6a55e6;--focus:#5847d1}\n' + walk(css)
}

module.exports = { lightTheme, mapColor }
