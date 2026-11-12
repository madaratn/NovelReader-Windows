const vm=require('node:vm')
const {fetchTrustedBookPlugin}=require('./book-plugin-policy.cjs')
const libs=require('./plugin-libs.cjs')
const cheerio=require('cheerio')
const dayjs=require('dayjs')
const htmlparser2=require('htmlparser2')
const urlencode=require('urlencode')

// User agent sent to the sites (overridable for the source check: NR_BOOK_UA).
const UA=process.env.NR_BOOK_UA||'Mozilla/5.0 NovelReader/0.2'
async function fetchApi(url,init={}){return fetch(url,{...init,headers:{'User-Agent':UA,'Accept':'*/*','Accept-Language':'*',...(init.headers||{})}})}
async function fetchText(url,init,encoding){try{const r=await fetchApi(url,init);if(!r.ok)return '';const b=Buffer.from(await r.arrayBuffer());return new TextDecoder(encoding||'utf-8').decode(b)}catch{return ''}}
// Each source keeps its own store for as long as the app runs.
const stores=new Map();let currentPlugin='';const storageFor=u=>{if(!stores.has(u))stores.set(u,libs.makeStorage());return stores.get(u)}
function runtimeRequire(name){
 if(name==='cheerio')return cheerio;if(name==='dayjs')return dayjs;if(name==='htmlparser2')return htmlparser2;if(name==='urlencode')return urlencode;
 if(name==='@libs/fetch')return{fetchApi,fetchText,fetchProto:async()=>{throw Error('fetchProto unsupported')}};
 if(name==='@libs/defaultCover')return{defaultCover:''};if(name==='@libs/novelStatus')return{NovelStatus:libs.NovelStatus};
 if(name==='@libs/filterInputs')return{FilterTypes:libs.FilterTypes,Filters:{}};if(name==='@libs/isAbsoluteUrl')return{isUrlAbsolute:u=>/^https?:\/\//i.test(u)};
 if(name==='@libs/storage')return storageFor(currentPlugin);
 if(name==='@/types/plugin')return{Plugin:{}};throw Error('Unsupported plugin dependency: '+name)
}
async function loadPlugin(url){const code=await fetchTrustedBookPlugin(url);currentPlugin=url;const module={exports:{}};const sandbox={module,exports:module.exports,require:runtimeRequire,console,URL,URLSearchParams,TextEncoder,TextDecoder,Headers,FormData,setTimeout,clearTimeout,atob,btoa,Buffer,AbortController,Response,Blob};vm.createContext(sandbox);new vm.Script(code,{filename:'lnreader-plugin.js',timeout:2000}).runInContext(sandbox,{timeout:2000});return module.exports.default||module.exports}
async function search(plugin,query){const p=await loadPlugin(plugin.url);if(!p||typeof p.searchNovels!=='function')throw Error('searchNovels unavailable');const results=await Promise.race([p.searchNovels(query,1),new Promise((_,rej)=>setTimeout(()=>rej(Error('Search timeout')),12000))]);return (results||[]).map(x=>({name:x.name,path:x.path,cover:x.cover,sourceId:plugin.id,sourceName:plugin.name,lang:plugin.lang}))}
// Popular / latest list of a source (LNReader plugins: popularNovels(page,{showLatestNovels,filters})).
async function popular(plugin,{page=1,latest=false}={}){const p=await loadPlugin(plugin.url);if(!p||typeof p.popularNovels!=='function')throw Error('popularNovels unavailable');const filters={};for(const [k,f] of Object.entries(p.filters||{}))if(f&&typeof f==='object')filters[k]={type:f.type,value:f.value};const results=await Promise.race([p.popularNovels(Number(page)||1,{showLatestNovels:!!latest,filters}),new Promise((_,rej)=>setTimeout(()=>rej(Error('Timeout')),15000))]);return (results||[]).map(x=>({name:x.name,path:x.path,cover:x.cover,sourceId:plugin.id,sourceName:plugin.name,lang:plugin.lang}))}
async function parseNovel(plugin,path){const p=await loadPlugin(plugin.url);return p.parseNovel(path)}
async function parseChapter(plugin,path){const p=await loadPlugin(plugin.url);if(!p||typeof p.parseChapter!=='function')throw Error('parseChapter unavailable');return Promise.race([p.parseChapter(path),new Promise((_,rej)=>setTimeout(()=>rej(Error('Chapter timeout')),15000))])}
module.exports={search,popular,parseNovel,parseChapter}
