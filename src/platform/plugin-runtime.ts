// LNReader book sources (plugins) running inside the app page, for Android (on the
// PC they run in the main process, electron/plugin-runner.cjs). Same small set of
// libraries; network requests go through the native HTTP layer (CapacitorHttp
// patches fetch, so there is no CORS limit and any header can be sent).
import {fetchTrustedBookPlugin} from '../lib/book-plugin-policy'
import * as cheerio from 'cheerio'
import dayjs from 'dayjs'
import * as htmlparser2 from 'htmlparser2'
import{FilterTypes,NovelStatus,makeStorage,aes,constants}from'./plugin-libs'
import{challengeKind}from'../lib/site-check'
import{t}from'../i18n'

const UA='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 NovelReader'
// A source may only reach web sites: not this device or the home network (the video
// engine and the phone link live there). Same rule as electron/book-web.cjs.
export function allowedBookUrl(url:string){
 let u:URL;try{u=new URL(String(url))}catch{return false}
 if(u.protocol!=='https:'&&u.protocol!=='http:')return false
 const h=u.hostname.replace(/^\[|\]$/g,'').toLowerCase()
 if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal'))return false
 if(/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h))return false
 if(h==='::1'||h==='::'||/^f[cd][0-9a-f]{2}:/.test(h)||/^fe80:/.test(h)||/^::ffff:/.test(h))return false
 return true}
// ---- Site checks (Cloudflare…) on the phone -------------------------------------
// A check page is passed in a WebView inside the app (SiteCheckPlugin.java); the
// clearance cookie and the WebView's user agent (they go together) are then sent
// with every request to that site. Kept 6 hours; a check that did not help is not
// tried again for a while.
type Pass={cookie:string,ua:string,at:number}
const passes:Record<string,Pass>=(()=>{try{return JSON.parse(localStorage.getItem('siteChecks')||'{}')}catch{return{}}})()
const savePasses=()=>{try{localStorage.setItem('siteChecks',JSON.stringify(passes))}catch{}}
const solving=new Map<string,Promise<boolean>>(),useless=new Map<string,number>()
const siteCheck=():any=>(globalThis as any).Capacitor?.Plugins?.SiteCheck
function passFor(host:string):Pass|null{const p=passes[host];return p&&Date.now()-p.at<6*3600e3?p:null}
async function solve(url:string,strict:boolean):Promise<boolean>{
 const P=siteCheck();if(!P)return false
 const u=new URL(url),host=u.host
 if(Date.now()<(useless.get(host)||0))return false
 if(solving.has(host))return solving.get(host)!
 const job=(async()=>{try{const r=await P.solve({url,show:strict,title:t('Site check: {site}',{site:host}),hint:t('This site checks that you are not a robot. Tick the box if one appears; this window closes by itself afterwards.'),cancel:t('Cancel')});if(r?.ok&&r.cookie){passes[host]={cookie:r.cookie,ua:r.userAgent||UA,at:Date.now()};savePasses();return true}
  useless.set(host,Date.now()+(strict?3:30)*60e3);return false}catch{return false}finally{setTimeout(()=>solving.delete(host),1500)}})()
 solving.set(host,job);return job}
export function siteCheckBusy(){return solving.size>0}
async function rawFetch(url:string,init:any){
 const host=(()=>{try{return new URL(url).host}catch{return''}})(),pass=passFor(host)
 const given=init.headers instanceof Headers?Object.fromEntries(init.headers.entries()):(init.headers||{})
 const headers:any={'User-Agent':pass?.ua||UA,Accept:'*/*','Accept-Language':'*','Sec-Fetch-Mode':'cors',...given}
 if(pass){headers['User-Agent']=pass.ua;const own=Object.keys(headers).find(k=>k.toLowerCase()==='cookie');headers[own||'Cookie']=(own?headers[own]+'; ':'')+pass.cookie}
 return fetch(url,{...init,headers})}
async function fetchApi(url:string,init:any={}){if(!allowedBookUrl(url))throw Error('Address not allowed for a book source: '+String(url).slice(0,80))
 let r=await rawFetch(url,init)
 if(siteCheck()&&(r.status!==200||Number(r.headers.get('content-length')||0)<12000)){
  let text='';try{text=await r.clone().text()}catch{}
  const kind=challengeKind(r.status,r.headers,text)
  if(kind){const page=String(init.method||'GET').toUpperCase()==='GET'?url:new URL(url).origin+'/'
   if(await solve(page,kind==='strict'))r=await rawFetch(url,init)}}
 return r}
async function fetchText(url:string,init?:any,encoding?:string){try{const r=await fetchApi(url,init);if(!r.ok)return'';return new TextDecoder(encoding||'utf-8').decode(await r.arrayBuffer())}catch{return''}}
async function fetchFile(url:string,init?:any){try{const r=await fetchApi(url,init);if(!r.ok)return'';const b=new Uint8Array(await r.arrayBuffer());let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s)}catch{return''}}
const urlencode={encode:(s:string)=>encodeURIComponent(s),decode:(s:string)=>decodeURIComponent(s),parse:(s:string)=>Object.fromEntries(new URLSearchParams(s)),stringify:(o:any)=>new URLSearchParams(o).toString()}
// Each source keeps its own store for as long as the app runs.
const stores=new Map<string,any>();let currentPlugin=''
const storageFor=(u:string)=>{if(!stores.has(u))stores.set(u,makeStorage());return stores.get(u)}
function runtimeRequire(name:string):any{
 if(name==='cheerio')return cheerio;if(name==='dayjs')return dayjs;if(name==='htmlparser2')return htmlparser2;if(name==='urlencode')return urlencode
 if(name==='@libs/fetch')return{fetchApi,fetchText,fetchFile,fetchProto:async()=>{throw Error('fetchProto unsupported')}}
 if(name==='@libs/defaultCover')return{defaultCover:''}
 if(name==='@libs/novelStatus')return{NovelStatus}
 if(name==='@libs/filterInputs')return{FilterTypes,Filters:{}}
 if(name==='@libs/isAbsoluteUrl')return{isUrlAbsolute:(u:string)=>/^https?:\/\//i.test(u)}
 if(name==='@libs/storage')return storageFor(currentPlugin)
 if(name==='@libs/aes')return aes
 if(name==='@/types/constants')return constants
 if(name==='@/types/plugin')return{Plugin:{}}
 throw Error('Unsupported plugin dependency: '+name)
}
const cache=new Map<string,Promise<any>>()
export function loadPlugin(url:string){
 if(!cache.has(url))cache.set(url,(async()=>{const code=await fetchTrustedBookPlugin(url);currentPlugin=url;const module:any={exports:{}}
  // eslint-disable-next-line no-new-func
  new Function('module','exports','require',code)(module,module.exports,runtimeRequire);return module.exports.default||module.exports})().catch(e=>{cache.delete(url);throw e}))
 return cache.get(url)!
}
// Time limit of a call; a site check in progress (maybe waiting for a click) pauses it,
// up to two more minutes.
const timeout=<T,>(p:Promise<T>,ms:number,msg:string)=>Promise.race([p,new Promise<T>((_,rej)=>{const end=Date.now()+ms+120e3;const tick=()=>{if(siteCheckBusy()&&Date.now()<end)return setTimeout(tick,500);rej(Error(msg))};setTimeout(tick,ms)})])
const card=(plugin:any)=>(x:any)=>({name:x.name,path:x.path,cover:x.cover,sourceId:plugin.id,sourceName:plugin.name,lang:plugin.lang})
export async function search(plugin:any,query:string){const p=await loadPlugin(plugin.url);if(!p||typeof p.searchNovels!=='function')throw Error('searchNovels unavailable');return(((await timeout(p.searchNovels(query,1),15000,'Search timeout')) as any[])||[]).map(card(plugin))}
export async function popular(plugin:any,page=1,latest=false){const p=await loadPlugin(plugin.url);if(!p||typeof p.popularNovels!=='function')throw Error('popularNovels unavailable');const filters:any={};for(const[k,f]of Object.entries(p.filters||{}))if(f&&typeof f==='object')filters[k]={type:(f as any).type,value:(f as any).value};return(((await timeout(p.popularNovels(Number(page)||1,{showLatestNovels:!!latest,filters}),18000,'Timeout')) as any[])||[]).map(card(plugin))}
export async function parseNovel(plugin:any,path:string){const p=await loadPlugin(plugin.url);return p.parseNovel(path)}
export async function parseChapter(plugin:any,path:string){const p=await loadPlugin(plugin.url);if(!p||typeof p.parseChapter!=='function')throw Error('parseChapter unavailable');return timeout(p.parseChapter(path),18000,'Chapter timeout')}
