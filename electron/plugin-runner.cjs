const vm=require('node:vm')
const {fetchTrustedBookPlugin}=require('./book-plugin-policy.cjs')
const libs=require('./plugin-libs.cjs')
const {allowedBookUrl}=require('./book-web.cjs')
const cheerio=require('cheerio')
const dayjs=require('dayjs')
const htmlparser2=require('htmlparser2')
const urlencode=require('urlencode')

// User agent sent to the sites (overridable for the source check: NR_BOOK_UA).
// Same user agent as the LNReader app, which these sources are written and tested for.
const UA=process.env.NR_BOOK_UA||'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
// Like the LNReader app: browser-like headers, and each source keeps its cookies
// (React Native keeps a cookie jar; several sites need it between two requests).
const BASE_HEADERS={'Accept':'*/*','Accept-Language':'*','Cache-Control':'max-age=0','Sec-Fetch-Mode':'cors'}
const jars=new Map();const jarFor=u=>{if(!jars.has(u))jars.set(u,new Map());return jars.get(u)}
// Optional trace of what each source received (used by the source check).
const traces=new Map();const traceOn=!!process.env.NR_BOOK_TRACE
function hostOf(u){try{return new URL(u).host}catch{return ''}}
// On the PC app the requests go through Chromium (electron/book-web.cjs); plain Node otherwise.
let web=null
function configure(o){web=o||null;loaded.clear()}
function makeFetch(pluginUrl){
 const jar=jarFor(pluginUrl)
 return async function fetchApi(url,init={}){
  const h=new Headers({'User-Agent':web&&web.userAgent||UA,...BASE_HEADERS});new Headers(init.headers||{}).forEach((v,k)=>h.set(k,v))
  const host=hostOf(String(url));const c=jar.get(host);if(!web&&c&&c.size&&!h.has('cookie'))h.set('Cookie',[...c].map(([k,v])=>k+'='+v).join('; '))
  if(!web&&!allowedBookUrl(url))throw Error('Address not allowed for a book source: '+String(url).slice(0,80))
  let r
  try{r=web?await web.fetch(String(url),{...init,headers:h}):await fetch(url,{...init,headers:h})}
  catch(e){if(traceOn)push(pluginUrl,String(url).slice(0,120)+' -> '+(e&&e.cause&&(e.cause.code||e.cause.message)||e.message));throw e}
  try{const set=typeof r.headers.getSetCookie==='function'?r.headers.getSetCookie():[];if(set.length){const m=jar.get(host)||new Map();for(const line of set){const kv=line.split(';')[0];const i=kv.indexOf('=');if(i>0)m.set(kv.slice(0,i).trim(),kv.slice(i+1).trim())}jar.set(host,m)}}catch{}
  if(traceOn){let snip='';try{const t=await r.clone().text();const title=(t.match(/<title[^>]*>([^<]{0,80})/i)||[])[1];snip=(title?'title='+title.trim():t.slice(0,80).replace(/\s+/g,' '))+' len='+t.length}catch{}push(pluginUrl,String(url).slice(0,120)+' -> '+r.status+' '+snip)}
  return r
 }
}
function push(u,line){const a=traces.get(u)||[];a.push(line);if(a.length>6)a.shift();traces.set(u,a)}
function makeFetchText(fetchApi){return async function fetchText(url,init,encoding){try{const r=await fetchApi(url,init);if(!r.ok)return '';const b=Buffer.from(await r.arrayBuffer());return new TextDecoder(encoding||'utf-8').decode(b)}catch{return ''}}}
// Each source keeps its own store for as long as the app runs.
const stores=new Map();const storageFor=u=>{if(!stores.has(u))stores.set(u,libs.makeStorage());return stores.get(u)}
function makeRequire(pluginUrl,fetchApi){const fetchText=makeFetchText(fetchApi);return function runtimeRequire(name){
 if(name==='cheerio')return cheerio;if(name==='dayjs')return dayjs;if(name==='htmlparser2')return htmlparser2;if(name==='urlencode')return urlencode;
 if(name==='@libs/fetch')return{fetchApi,fetchText,fetchFile:async(u,i)=>{try{const r=await fetchApi(u,i);if(!r.ok)return '';return Buffer.from(await r.arrayBuffer()).toString('base64')}catch{return ''}},fetchProto:async()=>{throw Error('fetchProto unsupported')}};
 if(name==='@libs/defaultCover')return{defaultCover:''};if(name==='@libs/novelStatus')return{NovelStatus:libs.NovelStatus};
 if(name==='@libs/filterInputs')return{FilterTypes:libs.FilterTypes,Filters:{}};if(name==='@libs/isAbsoluteUrl')return{isUrlAbsolute:u=>/^https?:\/\//i.test(u)};
 if(name==='@libs/storage')return storageFor(pluginUrl);
 if(name==='@libs/aes')return libs.aes;
 if(name==='@/types/constants')return libs.constants;
 if(name==='@/types/plugin')return{Plugin:{}};throw Error('Unsupported plugin dependency: '+name)
}}
// Time limit of a call; a site check in progress (Cloudflare window, maybe waiting
// for a click) pauses it, up to two more minutes.
function deadline(what,ms){return new Promise((_,rej)=>{const end=Date.now()+ms;let extra=Date.now()+ms+120e3;const tick=()=>{const busy=web&&web.solving&&web.solving()>0;if(Date.now()<end||busy&&Date.now()<extra)return setTimeout(tick,500);rej(Error(what))};setTimeout(tick,ms)})}
const loaded=new Map()
async function loadPlugin(url){const cached=loaded.get(url);if(cached&&Date.now()-cached.at<30*60e3)return cached.mod;const code=await fetchTrustedBookPlugin(url);const fetchApi=makeFetch(url);const module={exports:{}};const sandbox={module,exports:module.exports,require:makeRequire(url,fetchApi),console,URL,URLSearchParams,TextEncoder,TextDecoder,Headers,FormData,setTimeout,clearTimeout,setInterval,clearInterval,atob,btoa,Buffer,AbortController,Response,Request,Blob,crypto:globalThis.crypto,fetch:fetchApi};vm.createContext(sandbox);new vm.Script(code,{filename:'lnreader-plugin.js',timeout:2000}).runInContext(sandbox,{timeout:2000});const mod=module.exports.default||module.exports;loaded.set(url,{at:Date.now(),mod});return mod}
async function search(plugin,query){const p=await loadPlugin(plugin.url);if(!p||typeof p.searchNovels!=='function')throw Error('searchNovels unavailable');const results=await Promise.race([p.searchNovels(query,1),deadline('Search timeout',12000)]);return (results||[]).map(x=>({name:x.name,path:x.path,cover:x.cover,sourceId:plugin.id,sourceName:plugin.name,lang:plugin.lang}))}
// Popular / latest list of a source (LNReader plugins: popularNovels(page,{showLatestNovels,filters})).
async function genres(plugin){const p=await loadPlugin(plugin.url);const g=libs.genreFilter(p&&p.filters);return g?g.options:[]}
async function popular(plugin,{page=1,latest=false,genre=''}={}){const p=await loadPlugin(plugin.url);if(!p||typeof p.popularNovels!=='function')throw Error('popularNovels unavailable');let filters={};for(const [k,f] of Object.entries(p.filters||{}))if(f&&typeof f==='object')filters[k]={type:f.type,value:f.value};if(genre!==''&&genre!=null)filters=libs.withGenre(filters,libs.genreFilter(p.filters),genre);const results=await Promise.race([p.popularNovels(Number(page)||1,{showLatestNovels:!!latest&&!genre,filters}),deadline('Timeout',15000)]);return (results||[]).map(x=>({name:x.name,path:x.path,cover:x.cover,sourceId:plugin.id,sourceName:plugin.name,lang:plugin.lang}))}
async function parseNovel(plugin,path){const p=await loadPlugin(plugin.url);return p.parseNovel(path)}
async function parseChapter(plugin,path){const p=await loadPlugin(plugin.url);if(!p||typeof p.parseChapter!=='function')throw Error('parseChapter unavailable');return Promise.race([p.parseChapter(path),deadline('Chapter timeout',15000)])}
module.exports={search,popular,genres,parseNovel,parseChapter,configure,traceOf:u=>traces.get(u)||[]}
