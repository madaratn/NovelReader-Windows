// NovelReader on Android (Capacitor): the same interface, with this file standing
// in for the PC side (electron/preload.cjs). Books (sources, reading, offline
// chapters, translation) and videos (the engine in android/engine).
import * as plugins from './plugin-runtime'
import{offline}from'./offline-idb'
import{createAndroidUpdater}from'./android-update'
import{subsSearch,subsFetch}from'./android-subs'
import{androidSync}from'./android-sync'
import{installAndroidTts}from'./android-tts'

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
 if(/\/(videos|hosters|hosterVideos)$/.test(p))return 90000
 if(/\/(episodes|seasons|details)$/.test(p))return 30000
 if(/\/(search|popular|latest)$/.test(p))return 20000
 if(/\/extensions\/(install|repo)/.test(p))return 90000
 if(/\/cast\/(scan|start)$/.test(p))return 45000
 return 10000}
// iPhone: the engine of the linked PC (electron/engine-share.cjs), or none.
let engineOf=()=>ENGINE
async function miwayomiFetch(path:string,method='GET',body?:any){
 if(typeof path!=='string'||!path.startsWith('/'))throw Error('Invalid Miwayomi path')
 const ENGINE=engineOf();if(!ENGINE)throw Error('Link your PC in Settings to watch anime, series and movies on this iPhone.')
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
// Offline videos (android/engine/.../dl): same calls and answers as on the PC.
async function dlCall(path:string,method='GET',body?:any){
 try{return await miwayomiFetch('/api/v1/dl/'+path,method,body)}
 catch(e:any){const m=/ — (\{.*\})$/s.exec(String(e?.message||''));let msg='';try{msg=m?JSON.parse(m[1]).error:''}catch{}throw Error(msg||String(e?.message||e))}}
const downloads={
 dlStart:(p:any)=>dlCall('start','POST',{...p,episodeNo:Number(p?.episodeNo)||0}),
 dlList:()=>dlCall('list'),
 dlCancel:(id:string)=>dlCall('cancel','POST',{id:String(id||'')}),
 dlRemove:(id:string)=>dlCall('remove','POST',{id:String(id||'')}),
 dlClear:()=>dlCall('clear','POST',{}),
 dlConfigure:(o:any)=>dlCall('configure','POST',{maxHeight:Math.round(Number(o?.maxHeight)||0),limit:Math.round(Number(o?.limit)||0)}),
 dlUsage:()=>dlCall('usage'),
 dlBase:async()=>ENGINE+'/api/v1/dl/file',
 // The engine counts its changes; the interface looks every 2 s while it is shown.
 onDownloadsChanged:(cb:()=>void)=>{let last=-1;const iv=setInterval(async()=>{if(document.visibilityState!=='visible')return;try{const v=(await dlCall('version')).version;if(last>=0&&v!==last)cb();last=v}catch{}},2000);return()=>clearInterval(iv)},
}
async function miwayomiStatus(){try{const health=await miwayomiFetch('/api/v1/health');return{online:true,android:true,baseUrl:engineOf(),health}}catch(e:any){return{online:false,starting:engineOf()===ENGINE,android:true,baseUrl:engineOf(),error:String(e?.message||e)}}}

// Weekly source check: the PC scan, corrected by the phone sweep (run on an Android
// emulator): a source that fails on a phone is shown as failing here (a time-out of
// the test is not counted as a failure).
const STATUS='https://github.com/madaratn/NovelReader-Windows/releases/download/source-status/'
export function mergePhoneStatus(pc:any,phone:any){
 if(!pc||!Array.isArray(pc.results)||!phone||!Array.isArray(phone.results))return pc
 const by=new Map<string,any>(phone.results.map((x:any)=>[String(x.pkg),x]))
 return{...pc,phoneAt:phone.at,results:pc.results.map((r:any)=>{const a=by.get(String(r.pkg));return a&&a.state!=='ok'&&r.state!=='dead'&&!/timeout|timed out|no answer/i.test(String(a.detail||''))?{...r,state:'dead',detail:'On Android: '+String(a.detail||'not working')}:r})}}
async function sourceStatus(){
 const get=async(f:string)=>{try{const r=await fetch(STATUS+f);return r.ok?await r.json():null}catch{return null}}
 const[pc,phone]=await Promise.all([get('source-status.json'),get('source-status-android.json')])
 return mergePhoneStatus(pc,phone)}

// iPhone / iPad: the same phone interface. Apple does not let an app run the video
// extensions (Android code), so there is no video engine in the app there: books,
// and the sources the interface serves itself (Tunisian TV).
// Streams of the engine are asked directly, not through Capacitor's native relay:
// Android's WebView applies a byte range a second time to relayed answers (bytes 2-5
// came back as bytes 4-5), which broke streams read in pieces (HLS with byte ranges).
// The engine allows these direct requests (ApiRoutes.kt).
const STREAM=/^http:\/\/127\.0\.0\.1:4567\/api\/v1\/(hls|proxy|dash|dl\/file)[/?]/
export function directStreams(w:any=window){
 const orig=w.CapacitorWebXMLHttpRequest,P=w.XMLHttpRequest?.prototype
 if(orig?.open&&P&&!P.__nrDirect){const patched=P.open;P.__nrDirect=true
  P.open=function(this:any,method:string,url:any,...rest:any[]){if(String(method).toUpperCase()==='GET'&&STREAM.test(String(url))){this._method='GET';this._url='';return orig.open.call(this,method,url,...rest)}return patched.call(this,method,url,...rest)}}
 if(w.CapacitorWebFetch&&!w.__nrDirectFetch){const relayed=w.fetch;w.__nrDirectFetch=true
  w.fetch=(r:any,o?:any)=>{const url=typeof r==='string'?r:r?.url,m=String(o?.method||(typeof r==='string'?'':r?.method)||'GET').toUpperCase();return m==='GET'&&STREAM.test(String(url))?w.CapacitorWebFetch(r,o):relayed(r,o)}}}
// Backup file (FilesPlugin.java): saved where the person chooses, restored from a
// file they pick. Same checks and answers as the PC (electron/backup.cjs).
const files=()=>(window as any).Capacitor?.Plugins?.Files
export function checkBackup(payload:any){
 if(!payload||typeof payload!=='object'||payload.app!=='NovelReader'||payload.version!==1)throw Error('This file is not a NovelReader backup.')
 const data=payload.data;if(!data||typeof data!=='object'||Array.isArray(data))throw Error('The backup is damaged (no data).')
 for(const[k,v]of Object.entries(data))if(typeof k!=='string'||typeof v!=='string')throw Error('The backup is damaged (invalid entry).')
 return{app:'NovelReader',version:1,exportedAt:Number(payload.exportedAt)||0,data}}
const backup={
 backupExport:async(payload:any)=>{const clean=checkBackup(payload),r=await files().save({name:'NovelReader-backup-'+new Date().toISOString().slice(0,10)+'.json',type:'application/json',text:JSON.stringify(clean,null,1)});return r?.ok?{ok:true,path:r.path||''}:{ok:false,canceled:true}},
 backupImport:async()=>{const r=await files().open();if(!r?.ok)return{ok:false,canceled:true}
  let x:any;try{x=JSON.parse(r.text)}catch{throw Error('This file is not a NovelReader backup.')}
  const payload=checkBackup(x);let novels=0;try{novels=JSON.parse(payload.data.library||'[]').length}catch{}
  return{ok:true,payload,novels,keys:Object.keys(payload.data).length,exportedAt:payload.exportedAt}},
}
// Videos stored on the device (FilesPlugin.java): folders the person chose once; the
// files are played through the app's own address for content (Capacitor).
const localVideos={
 localFolders:async()=>(await files().folders()).folders||[],
 localAddFolder:async()=>(await files().addFolder()).folders||[],
 localRemoveFolder:async(folder:string)=>(await files().removeFolder({folder})).folders||[],
 localListVideos:async()=>((await files().listVideos()).videos||[]).map((v:any)=>({name:v.name,folder:v.folder,relPath:v.relPath,size:v.size,mtime:v.mtime,url:(window as any).Capacitor?.convertFileSrc?.(v.uri)||v.uri}))
  .sort((a:any,b:any)=>(a.folder+'/'+a.relPath).localeCompare(b.folder+'/'+b.relPath,undefined,{numeric:true})),
}
export function installAndroidBridge(version:string,ios=false){
 document.documentElement.classList.add('android')
 if(!ios)directStreams()
 // Read aloud: the phone's voices behind the browser's speechSynthesis (the WebView has none).
 if(!ios)installAndroidTts((window as any).Capacitor?.Plugins?.Tts)
 // A television: remote-control navigation (platform/tv.ts).
 if(!ios)(window as any).Capacitor?.Plugins?.Player?.device?.().then((d:any)=>{if(d?.tv)import('./tv').then(m=>m.enableTv())}).catch(()=>{})
 if(ios){document.documentElement.classList.add('ios');engineOf=()=>{try{return localStorage.getItem('pcEngine')||''}catch{return''}}}
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
  ...androidSync,
  ...(ios?{syncChoose:undefined}:{...createAndroidUpdater(version),...downloads,...cast,...backup,...localVideos}),
  subsSearch,subsFetch,
  takeDeepLink:async()=>'',inviteBase:async()=>'',onDeepLink:()=>()=>{},
  sourceStatus:ios?async()=>null:sourceStatus,
  backupAuto:async()=>({ok:false}),
 }
 // Anything else (PC-only features: cast, downloads, AniList windows…) is absent, so the
 // interface hides it; direct calls give a clear message.
 const DIRECT=new Set(['importLNReader','archiveSearch','archiveFiles','torrentStart','torrentStartMagnet','torrentStatus','torrentStop','backupListAuto','backupReadAuto','backupOpenFolder'])
 ;(window as any).novelReader=new Proxy(impl,{get:(t,p:string)=>p in t?t[p]:DIRECT.has(p)?later(p):undefined,has:(t,p:string)=>p in t})
}
