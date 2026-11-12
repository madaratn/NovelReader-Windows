import {test,expect} from '@playwright/test'
import {trustedBookPluginUrl,isTrustedBookPluginUrl,fetchTrustedBookPlugin,MAX_BOOK_PLUGIN_BYTES} from '../../src/lib/book-plugin-policy'

const official='https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/arabic/ArNovel[madara].js'

test('Android/iOS book-plugin policy accepts official URLs and rejects redirected/malformed hosts',()=>{
 expect(trustedBookPluginUrl(official)).toBe(official)
 const bad=[
  'https://evil.test/anything.js',
  'https://raw.githubusercontent.com.evil.test/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/a.js',
  'http://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/a.js',
  official+'?auth=1',
  official.replace('ArNovel[madara].js','%2e%2e/bad.js'),
  official.replace('ArNovel[madara].js','../a.js')
 ]
 for(const url of bad)expect(isTrustedBookPluginUrl(url)).toBe(false)
 expect(isTrustedBookPluginUrl(official)).toBe(true)
})

test('mobile source-download guard does not request blocked URLs and caps bundle bytes',async()=>{
 let calls=0
 await expect(fetchTrustedBookPlugin('https://evil.test/b.js',async()=>{
  calls++;throw Error('unexpected request')
 })).rejects.toThrow(/blocked/)
 expect(calls).toBe(0)
 await expect(fetchTrustedBookPlugin(official,async()=>new Response(new Uint8Array(MAX_BOOK_PLUGIN_BYTES+1)))).rejects.toThrow(/too large/)
 const src='module.exports={searchNovels:async()=>[]}'
 await expect(fetchTrustedBookPlugin(official,async(_url,init)=>{
  expect(init?.credentials).toBe('omit')
  return new Response(src)
 })).resolves.toBe(src)
})
