// NovelReader on Android (Capacitor): the same interface, with this file standing
// in for the PC side (electron/preload.cjs). Books (sources, reading, offline
// chapters, translation) and videos (the engine in android/engine).
import * as plugins from './plugin-runtime'
import{offline}from'./offline-idb'

export const isAndroidApp=()=>!!(window as any).Capacitor?.isNativePlatform?.()&&(window as any).Capacitor?.getPlatform?.()==='android'

// Chapter translation (same endpoint as electron/translate.cjs).
const trCache=new Map<string,string>()
async function translate({texts,to,from='auto'}:{texts:string[],to:string,from?:string}){
 const list=(texts||[]).map(x=>String(x||'')),target=String(to||'en').slice(0,10),out=list.map(x=>x.trim()?trCache.get(target+'\u0000'+x):x)
 const todo=list.map((_,i)=>i).filter(i=>out[i]===undefined)
 for(let k=0;k<todo.length;k+=40){const idx=todo.slice(k,k+40),body=new URLSearchParams();for(const i of idx)body.append('q',list[i])
  const r=await fetch('https://translate.googleapis.com/translate_a/t?client=gtx&sl='+encodeURIComponent(from)+'&tl='+encodeURIComponent(target)+'&format=html',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:body.toString()})
  if(!r.ok)throw Error(r.status===429?'Too many requests: wait a minute and try again':'HTTP '+r.status)
  const j=await r.json(),arr=(Array.isArray(j)?j:[j]).map((x:any)=>Array.isArray(x)?String(x[0]??''):String(x??''))
  idx.forEach((i,n)=>{out[i]=arr[n]??list[i];trCache.set(target+'\u0000'+list[i],out[i]!)})}
 return out as string[]
}
const later=(what:string)=>async()=>{throw Error(what+': not available on Android yet')}

// Video engine: runs inside the app (android/engine), same API and address as on the PC.
const ENGINE='http://127.0.0.1:4567'
function engineTimeout(path:string){const p=String(path).split('?')[0]
 if(/\/(videos|hosters|hosterVideos)$/.test(p))return 60000
 if(/\/(episodes|seasons|details)$/.test(p))return 30000
 if(/\/(search|popular|latest)$/.test(p))return 20000
 if(/\/extensions\/(install|repo)/.test(p))return 90000
 return 10000}
async function miwayomiFetch(path:string,method='GET',body?:any){
 if(typeof path!=='string'||!path.startsWith('/'))throw Error('Invalid Miwayomi path')
 const ms=engineTimeout(path),ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),ms)
 try{const r=await fetch(ENGINE+path,{method,signal:ctl.signal,headers:{'Content-Type':'application/json'},body:body==null?undefined:JSON.stringify(body)})
  const ct=r.headers.get('content-type')||''
  if(!r.ok){let d='';try{d=(await r.text()).trim()}catch{}if(d.length>2000)d=d.slice(0,2000)+'…';throw Error('Miwayomi HTTP '+r.status+(d?' — '+d:''))}
  return ct.includes('json')?await r.json():await r.text()}
 catch(e:any){if(e?.name==='AbortError')throw Error('Miwayomi request timed out after '+Math.round(ms/1000)+' s ('+path.split('?')[0]+')');throw e}
 finally{clearTimeout(timer)}}
async function miwayomiStatus(){try{const health=await miwayomiFetch('/api/v1/health');return{online:true,android:true,baseUrl:ENGINE,health}}catch(e:any){return{online:false,starting:true,android:true,baseUrl:ENGINE,error:String(e?.message||e)}}}

export function installAndroidBridge(version:string){
 document.documentElement.classList.add('android')
 const impl:Record<string,any>={
  platform:'android',
  searchPlugin:(p:any,q:string)=>plugins.search(p,q),
  popularPlugin:(p:any,page:number,latest:boolean)=>plugins.popular(p,page,latest),
  parseNovel:(p:any,path:string)=>plugins.parseNovel(p,path),
  parseChapter:(p:any,path:string)=>plugins.parseChapter(p,path),
  translate,
  appVersion:async()=>version,
  offlineSave:offline.save,offlineGet:offline.get,offlineList:offline.list,offlineRemove:offline.remove,offlineUsage:offline.usage,offlineClear:offline.clear,
  miwayomiStatus,miwayomiFetch,
  updateStatus:async()=>({state:'unsupported'}),onUpdateStatus:()=>()=>{},updateCheck:async()=>({state:'unsupported'}),
  takeDeepLink:async()=>'',inviteBase:async()=>'',onDeepLink:()=>()=>{},
  sourceStatus:async()=>{const r=await fetch('https://github.com/madaratn/NovelReader-Windows/releases/download/source-status/source-status.json');return r.ok?r.json():null},
  backupAuto:async()=>({ok:false}),
 }
 // Anything else (PC-only features: cast, downloads, AniList windows…) is absent, so the
 // interface hides it; direct calls give a clear message.
 const DIRECT=new Set(['importLNReader','localAddFolder','localFolders','localListVideos','localRemoveFolder','archiveSearch','archiveFiles','torrentStart','torrentStartMagnet','torrentStatus','torrentStop','backupExport','backupImport','backupListAuto','backupReadAuto','backupOpenFolder','updateInstall'])
 ;(window as any).novelReader=new Proxy(impl,{get:(t,p:string)=>p in t?t[p]:DIRECT.has(p)?later(p):undefined,has:(t,p:string)=>p in t})
}
