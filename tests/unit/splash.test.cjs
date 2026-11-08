const test=require('node:test')
const assert=require('node:assert')
const {createSplash,splashHtml}=require('../../electron/splash.cjs')

function fakeBW(){const made=[];class BW{constructor(o){this.o=o;this.ev={};this.destroyed=false;this.shown=false;this.webContents={};made.push(this)}setMenuBarVisibility(){}loadURL(u){this.url=u;setTimeout(()=>this.ev['ready-to-show']&&this.ev['ready-to-show'](),5)}once(e,f){this.ev[e]=f}on(e,f){this.ev[e]=f}show(){this.shown=true}isDestroyed(){return this.destroyed}destroy(){this.destroyed=true}}return{BW,made}}
const wait=ms=>new Promise(r=>setTimeout(r,ms))

test('loading screen: not shown for a quick start, shown for a slow one and closed when the app is ready',async()=>{
 let f=fakeBW()
 let s=createSplash({BrowserWindow:f.BW,app:{getLocale:()=>'fr-FR'},delay:40})
 s.start();await wait(10);s.finish();await wait(80)
 assert.equal(f.made.length,0) // quick start: no flash
 f=fakeBW();s=createSplash({BrowserWindow:f.BW,app:{getLocale:()=>'fr-FR'},delay:20})
 s.start();await wait(60)
 assert.equal(f.made.length,1);assert.ok(f.made[0].shown);assert.equal(f.made[0].o.frame,false)
 assert.match(decodeURIComponent(f.made[0].url),/Ouverture…/)
 s.finish();await wait(200);assert.ok(f.made[0].destroyed)
})

test('loading screen text follows the system language (Arabic right to left)',()=>{
 assert.match(splashHtml('ar',''),/dir="rtl"[\s\S]*جارٍ الفتح/)
 assert.match(splashHtml('de',''),/Opening…/)
})
