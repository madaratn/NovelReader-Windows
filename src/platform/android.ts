// NovelReader on Android (Capacitor): the same interface, with this file standing
// in for the PC side (electron/preload.cjs). Books (sources, reading, offline
// chapters, translation) and videos (the engine in android/engine).
import * as plugins from './plugin-runtime'
import{offline}from'./offline-idb'
import{createAndroidUpdater}from'./android-update'
import{subsSearch,subsFetch}from'./android-subs'

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
 if(/\/cast\/(scan|start)$/.test(p))return 45000
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
// Cast to a TV (android/engine/.../cast): same calls as on the PC, served by the engine.
async function castCall(path:string,method='POST',body?:any){
 try{return await miwayomiFetch('/api/v1/cast/'+path,method,body)}
 catch(e:any){const m=/ — (\{.*\})$/s.exec(String(e?.message||''));let msg='';try{msg=m?JSON.parse(m[1]).error:''}catch{}throw Error(msg||String(e?.message||e))}}
const cast={
 castScan:()=>castCall('scan','POST',{}),
 castStart:(o:any)=>castCall('start','POST',o),
 castControl:(action:string,value?:number)=>castCall('control','POST',{action,value:value??null}),
 castStatus:()=>castCall('status','GET'),
 castStop:()=>castCall('stop','POST',{}),
 castDiag:()=>miwayomiFetch('/api/v1/cast/diag').then(String).catch(()=>''),
}
async function miwayomiStatus(){try{const health=await miwayomiFetch('/api/v1/health');return{online:true,android:true,baseUrl:ENGINE,health}}catch(e:any){return{online:false,starting:true,android:true,baseUrl:ENGINE,error:String(e?.message||e)}}}

// Weekly source check: the PC scan, corrected by the phone sweep (run on an Android
// emulator): a source that fails on a phone is shown as failing here.
const STATUS='https://github.com/madaratn/NovelReader-Windows/releases/download/source-status/'
export function mergePhoneStatus(pc:any,phone:any){
 if(!pc||!Array.isArray(pc.results)||!phone||!Array.isArray(phone.results))return pc
 const by=new Map<string,any>(phone.results.map((x:any)=>[String(x.pkg),x]))
 return{...pc,phoneAt:phone.at,results:pc.results.map((r:any)=>{const a=by.get(String(r.pkg));return a&&a.state!=='ok'&&r.state!=='dead'?{...r,state:'dead',detail:'On Android: '+String(a.detail||'not working')}:r})}}
async function sourceStatus(){
 const get=async(f:string)=>{try{const r=await fetch(STATUS+f);return r.ok?await r.json():null}catch{return null}}
 const[pc,phone]=await Promise.all([get('source-status.json'),get('source-status-android.json')])
 return mergePhoneStatus(pc,phone)}

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
  ...createAndroidUpdater(version),
  subsSearch,subsFetch,
  ...cast,
  takeDeepLink:async()=>'',inviteBase:async()=>'',onDeepLink:()=>()=>{},
  sourceStatus,
  backupAuto:async()=>({ok:false}),
 }
 // Anything else (PC-only features: cast, downloads, AniList windows…) is absent, so the
 // interface hides it; direct calls give a clear message.
 const DIRECT=new Set(['importLNReader','localAddFolder','localFolders','localListVideos','localRemoveFolder','archiveSearch','archiveFiles','torrentStart','torrentStartMagnet','torrentStatus','torrentStop','backupExport','backupImport','backupListAuto','backupReadAuto','backupOpenFolder'])
 ;(window as any).novelReader=new Proxy(impl,{get:(t,p:string)=>p in t?t[p]:DIRECT.has(p)?later(p):undefined,has:(t,p:string)=>p in t})
}
