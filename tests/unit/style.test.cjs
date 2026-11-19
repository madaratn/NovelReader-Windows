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
 // :where() rules weigh nothing on purpose; a copy scoped to the light theme would
 // outweigh the rules meant to win over them (a border back on borderless buttons).
 assert.ok(!/:where\(/.test(light))
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
  if(r.selector==='.media-player-top:fullscreen,.player-stage')r.walkDecls(/^--(bg|text|line)/,d=>{full[d.prop]=d.value})})
 assert.ok(Object.keys(dark).length>25)
 assert.deepEqual(full,dark)
 // and the light theme makes no copy of the full screen rules
 const light=lightTheme(css)
 assert.ok(!/:fullscreen|\.player-skip|\.player-next|\.po-bar|\.seek-flash|\.mini-bar/.test(light))
})
