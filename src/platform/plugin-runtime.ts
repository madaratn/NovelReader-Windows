// LNReader book sources (plugins) running inside the app page, for Android (on the
// PC they run in the main process, electron/plugin-runner.cjs). Same small set of
// libraries; network requests go through the native HTTP layer (CapacitorHttp
// patches fetch, so there is no CORS limit and any header can be sent).
import {fetchTrustedBookPlugin} from '../lib/book-plugin-policy'
import * as cheerio from 'cheerio'
import dayjs from 'dayjs'
import * as htmlparser2 from 'htmlparser2'

const UA='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 NovelReader'
async function fetchApi(url:string,init:any={}){return fetch(url,{...init,headers:{'User-Agent':UA,Accept:'*/*','Accept-Language':'*',...(init.headers||{})}})}
async function fetchText(url:string,init?:any,encoding?:string){try{const r=await fetchApi(url,init);if(!r.ok)return'';return new TextDecoder(encoding||'utf-8').decode(await r.arrayBuffer())}catch{return''}}
const urlencode={encode:(s:string)=>encodeURIComponent(s),decode:(s:string)=>decodeURIComponent(s),parse:(s:string)=>Object.fromEntries(new URLSearchParams(s)),stringify:(o:any)=>new URLSearchParams(o).toString()}
const noStore={getItem:()=>null,setItem:()=>{}}
function runtimeRequire(name:string):any{
 if(name==='cheerio')return cheerio;if(name==='dayjs')return dayjs;if(name==='htmlparser2')return htmlparser2;if(name==='urlencode')return urlencode
 if(name==='@libs/fetch')return{fetchApi,fetchText,fetchProto:async()=>{throw Error('fetchProto unsupported')}}
 if(name==='@libs/defaultCover')return{defaultCover:''}
 if(name==='@libs/novelStatus')return{NovelStatus:{Unknown:0,Ongoing:1,Completed:2,Licensed:3,PublishingFinished:4,Cancelled:5,OnHiatus:6}}
 if(name==='@libs/filterInputs')return{Filters:{}}
 if(name==='@libs/isAbsoluteUrl')return{isUrlAbsolute:(u:string)=>/^https?:\/\//i.test(u)}
 if(name==='@libs/storage')return{storage:{getItem:async()=>null,setItem:async()=>{}},localStorage:noStore,sessionStorage:noStore}
 if(name==='@/types/plugin')return{Plugin:{}}
 throw Error('Unsupported plugin dependency: '+name)
}
const cache=new Map<string,Promise<any>>()
export function loadPlugin(url:string){
 if(!cache.has(url))cache.set(url,(async()=>{const code=await fetchTrustedBookPlugin(url);const module:any={exports:{}}
  // eslint-disable-next-line no-new-func
  new Function('module','exports','require',code)(module,module.exports,runtimeRequire);return module.exports.default||module.exports})().catch(e=>{cache.delete(url);throw e}))
 return cache.get(url)!
}
const timeout=<T,>(p:Promise<T>,ms:number,msg:string)=>Promise.race([p,new Promise<T>((_,rej)=>setTimeout(()=>rej(Error(msg)),ms))])
const card=(plugin:any)=>(x:any)=>({name:x.name,path:x.path,cover:x.cover,sourceId:plugin.id,sourceName:plugin.name,lang:plugin.lang})
export async function search(plugin:any,query:string){const p=await loadPlugin(plugin.url);if(!p||typeof p.searchNovels!=='function')throw Error('searchNovels unavailable');return(((await timeout(p.searchNovels(query,1),15000,'Search timeout')) as any[])||[]).map(card(plugin))}
export async function popular(plugin:any,page=1,latest=false){const p=await loadPlugin(plugin.url);if(!p||typeof p.popularNovels!=='function')throw Error('popularNovels unavailable');const filters:any={};for(const[k,f]of Object.entries(p.filters||{}))if(f&&typeof f==='object')filters[k]={type:(f as any).type,value:(f as any).value};return(((await timeout(p.popularNovels(Number(page)||1,{showLatestNovels:!!latest,filters}),18000,'Timeout')) as any[])||[]).map(card(plugin))}
export async function parseNovel(plugin:any,path:string){const p=await loadPlugin(plugin.url);return p.parseNovel(path)}
export async function parseChapter(plugin:any,path:string){const p=await loadPlugin(plugin.url);if(!p||typeof p.parseChapter!=='function')throw Error('parseChapter unavailable');return timeout(p.parseChapter(path),18000,'Chapter timeout')}
