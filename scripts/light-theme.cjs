// Generates the light theme from the (dark) stylesheet: every rule that uses
// a color gets a copy scoped to :root[data-theme=light] with the colors
// remapped by role. Used by vite.config.ts at build/dev time, so the light
// theme follows style.css automatically.
//
// Roles: backgrounds (dark -> light surfaces, keeping their hierarchy),
// text (light -> dark, never lighter than a readable grey), borders (dark ->
// light greys), shadows (softened). Accent colors keep their hue. The novel
// reader has its own themes and is left untouched.

const EXCLUDE = /\.readerpage|\.readercontent|rtheme|::highlight|\.sw-|\.readerbar|tts-current|@keyframes|\.libcover|\.stats-fill/

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

function role(prop) {
  if (/^(color|fill|accent-color|--muted|--focus|caret-color|text-decoration-color)$/.test(prop)) return 'text'
  if (/^(border|outline)|^--side-border|^--media-line|border-top-color|border-color/.test(prop)) return 'border'
  if (/box-shadow|text-shadow/.test(prop)) return 'shadow'
  if (/^(background|background-color)$|^--side-bg|^--side-hover|^--media-card|^--accent-soft/.test(prop)) return 'bg'
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
    if (L > 0.3) return c // accents (primary buttons), yellows, light surfaces
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
    if (neutral) return toHex(fromHsl({ h, s: Math.min(s, 0.2), l: Math.min(0.42, 0.06 + (1 - L) * 0.9) }, col.a))
    if (h >= 235 && h <= 275) return col.a < 1 ? toHex({ r: 88, g: 71, b: 209, a: col.a }) : '#5847d1' // brand violet
    let nl = 0.42, out = fromHsl({ h, s: Math.max(0.45, Math.min(0.7, s)), l: nl }, col.a)
    while (contrastOnWhite(out) < 5 && nl > 0.15) { nl -= 0.02; out = fromHsl({ h, s: Math.max(0.45, Math.min(0.7, s)), l: nl }, col.a) }
    return toHex(out)
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
  const { s } = toHsl(col); return lum(col) > 0.3 && s > 0.3
}

function transformDecls(decls) {
  // Every colour declaration of the rule is re-emitted (mapped or not) so the
  // scoped copies keep the same precedence between themselves as the originals.
  const keepWhite = onAccentBackground(decls)
  let hasColor = false
  const out = decls.split(';').map(d => {
    const i = d.indexOf(':'); if (i < 0) return null
    const prop = d.slice(0, i).trim().toLowerCase(), val = d.slice(i + 1).trim()
    const r = role(prop); if (!r) return null
    if (/^(none|0)$/.test(val)) return null
    COLOR_RE.lastIndex = 0
    if (COLOR_RE.test(val)) hasColor = true
    COLOR_RE.lastIndex = 0
    const nv = val.replace(COLOR_RE, m => (r === 'text' && keepWhite && lum(parseColor(m) || { r: 0, g: 0, b: 0 }) > 0.9) ? m : mapColor(m, r))
    return `${prop}:${nv}`
  }).filter(Boolean)
  return out.length && hasColor ? out.join(';') : (out.length ? out.join(';') : null)
}

const scope = sel => sel.split(',').map(s => {
  s = s.trim()
  if (s === ':root' || s === 'html') return ':root[data-theme=light]'
  if (/^:root/.test(s)) return s.replace(/^:root/, ':root[data-theme=light]')
  if (/^(html|body)\b/.test(s)) return ':root[data-theme=light] ' + s.replace(/^html\s*/, '')
  return ':root[data-theme=light] ' + s
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
