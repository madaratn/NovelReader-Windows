// The style sheet and the light theme made from it are valid CSS. A stray "}" used to
// sit in style.css unnoticed: the browser then drops the whole rule that follows it
// (the page padding of Android tablets, for one), and nothing says so.
const test=require('node:test')
const assert=require('node:assert')
const fs=require('node:fs')
const path=require('node:path')
const postcss=require('postcss')
const{lightTheme}=require('../../scripts/light-theme.cjs')
const css=fs.readFileSync(path.join(__dirname,'../../src/style.css'),'utf8')

test('style.css parses without error',()=>{
 const root=postcss.parse(css)
 assert.ok(root.nodes.length>500)
})

test('the light theme made from it parses too, and leaves the base layer alone',()=>{
 const light=lightTheme(css)
 const root=postcss.parse(light)
 assert.ok(root.nodes.length>300)
 // The base layer (:where(button)…) is made of tokens only and has no copy; the only
 // :where() of the light theme is the scope of its copies, which adds no weight.
 assert.ok(!/:where\((?!:root\[data-theme=light\]\)|\[data-theme=light\]\))/.test(light))
 // A ";" inside a value (data URI) would cut a declaration in two.
 root.walkDecls(d=>assert.ok(!/^\s*(utf8|base64)\b/.test(d.prop),'declaration cut at a ";": '+d.prop))
})

test('no rule sits inside another one by accident (a missing "}")',()=>{
 const root=postcss.parse(css)
 root.walkRules(r=>{if(r.parent&&r.parent.type==='rule')assert.fail('rule nested in '+r.parent.selector.slice(0,60)+': '+r.selector.slice(0,60))})
})

test('every token used is defined',()=>{
 const defined=new Set();postcss.parse(css).walkDecls(d=>{if(d.prop.startsWith('--'))defined.add(d.prop)})
 const missing=new Set()
 for(const m of css.matchAll(/var\((--[a-z0-9-]+)(\s*,[^)]*)?\)/gi))if(!defined.has(m[1])&&!m[2])missing.add(m[1])
 // Set from the script, not in the style sheet: the reader's own settings.
 for(const k of['--r-font','--r-size','--r-leading','--r-width'])missing.delete(k)
 assert.deepEqual([...missing],[])
})

test('the player in full screen and what is drawn over the picture are dark in both themes: their tokens are the dark ones',()=>{
 const root=postcss.parse(css),dark={},full={}
 root.walkRules(r=>{
  if(r.selector===':root'&&!Object.keys(dark).length)r.walkDecls(/^--(bg|text|line)/,d=>{dark[d.prop]=d.value})
  if(r.selector==='.media-player-top:fullscreen,.player-stage,.pt-stage')r.walkDecls(/^--(bg|text|line)/,d=>{full[d.prop]=d.value})})
 assert.ok(Object.keys(dark).length>25)
 assert.deepEqual(full,dark)
 // and the light theme makes no copy of the full screen rules
 const light=lightTheme(css)
 // (.pt-…: the screen of a stream watched in a watch party)
 assert.ok(!/:fullscreen|\.player-skip|\.player-next|\.po-bar|\.seek-flash|\.mini-bar|\.pt-bar|\.pt-top|\.party-theater/.test(light))
})

test('the light theme: copies weigh what their rule weighs, and carry "0" and "none"',()=>{
 const light=lightTheme('.a{border:1px solid #101320;color:#e7e3dc}.b .a{border:0;background:none}html.android .c{color:#e7e3dc}body .d{box-shadow:none;outline:none}:root{--bg-x:#0b0d14}')
 // the scope of a copy is inside :where(): no weight added, so the copy of the rule
 // that wins in the dark theme wins in the light one
 assert.match(light,/:where\(:root\[data-theme=light\]\) \.a\{border:1px solid #[0-9a-f]{6};color:#[0-9a-f]{6}\}/)
 // a border taken away by a later rule stays away
 assert.match(light,/:where\(:root\[data-theme=light\]\) \.b \.a\{border:0;background:none\}/)
 assert.match(light,/:where\(:root\[data-theme=light\]\) body \.d\{box-shadow:none;outline:none\}/)
 // a class of the root element ("html.android") is read on the root itself
 assert.match(light,/html:where\(\[data-theme=light\]\)\.android \.c\{color:#[0-9a-f]{6}\}/)
 // the tokens outweigh the dark ones
 assert.match(light,/\n:root\[data-theme=light\]\{--bg-x:#[0-9a-f]{6}\}/)
})
