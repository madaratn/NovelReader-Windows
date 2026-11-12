const test=require('node:test')
const assert=require('node:assert/strict')
const {
 trustedBookPluginUrl,fetchTrustedBookPlugin,MAX_BOOK_PLUGIN_BYTES
}=require('../../electron/book-plugin-policy.cjs')
const runner=require('../../electron/plugin-runner.cjs')

const good='https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/arabic/ArNovel[madara].js'
const bad=[
 'http://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/x.js',
 'https://raw.githubusercontent.com.evil.test/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/x.js',
 'https://evil.test/a.js','file:///etc/passwd','javascript:alert(1)',
 'https://raw.githubusercontent.com/evil/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/x.js',
 'https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/../x.js',
 'https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/%2e%2e/x.js',
 'https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/x.js?token=1',
 'https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/x.js#x',
 good.replace('https://','https://user:pass@')
]

test('official LNReader code URLs are accepted; other code origins and ambiguous paths are denied',()=>{
 assert.equal(trustedBookPluginUrl(good),good)
 for(const url of bad)assert.throws(()=>trustedBookPluginUrl(url),/blocked/i,url)
 for(const url of [null,{},'',5])assert.throws(()=>trustedBookPluginUrl(url),/blocked/i)
})

test('download refuses a blocked source before performing any network request',async()=>{
 let calls=0
 await assert.rejects(fetchTrustedBookPlugin('https://evil.test/a.js',async()=>{calls++;throw Error('unexpected')}),/blocked/i)
 assert.equal(calls,0)
})

test('official source download is credentialless and has a byte limit',async()=>{
 let called=0
 const src='module.exports={searchNovels:async()=>[]}'
 const result=await fetchTrustedBookPlugin(good,async(url,opts)=>{
  called++
  assert.equal(url,good)
  assert.equal(opts.credentials,'omit')
  assert.equal(opts.redirect,'error')
  return new Response(src,{status:200})
 })
 assert.equal(result,src)
 assert.equal(called,1)
 await assert.rejects(fetchTrustedBookPlugin(good,async()=>new Response(new Uint8Array(MAX_BOOK_PLUGIN_BYTES+1))),/too large/i)
 await assert.rejects(fetchTrustedBookPlugin(good,async()=>new Response('',{headers:{'Content-Length':String(MAX_BOOK_PLUGIN_BYTES+1)}})),/too large/i)
 const interceptor=new Response(src)
 Object.defineProperty(interceptor,'url',{value:'https://localhost/_capacitor_http_interceptor_?u='+encodeURIComponent(good)})
 assert.equal(await fetchTrustedBookPlugin(good,async()=>interceptor),src)
 const forged=new Response(src)
 Object.defineProperty(forged,'url',{value:'https://localhost/_capacitor_http_interceptor_?u='+encodeURIComponent('https://evil.test/a.js')})
 await assert.rejects(fetchTrustedBookPlugin(good,async()=>forged),/redirect blocked/i)
 const redirected=new Response('ok')
 Object.defineProperty(redirected,'url',{value:'https://evil.test/a.js'})
 await assert.rejects(fetchTrustedBookPlugin(good,async()=>redirected),/redirect blocked/i)
})

test('Electron plugin entry points also block arbitrary JavaScript URLs',async()=>{
 for(const action of [
  ()=>runner.search({url:'https://evil.test/a.js',id:'x',name:'Evil'},'test'),
  ()=>runner.popular({url:'https://evil.test/a.js',id:'x'},{}),
  ()=>runner.parseNovel({url:'https://evil.test/a.js'},'/novel'),
  ()=>runner.parseChapter({url:'https://evil.test/a.js'},'/chapter')
 ])await assert.rejects(action(),/blocked/i)
})
