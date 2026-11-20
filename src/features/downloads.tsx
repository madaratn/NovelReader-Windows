// Offline video downloads: shared store, per-episode button, Downloads page and the
// helpers main.tsx uses to play a downloaded episode instead of the online stream.
// The work itself happens in the main process (electron/video-downloads.cjs).
import React,{useEffect,useState}from'react'
import{t,plural,getLang}from'../i18n'
import{EmptyState,Cover,NoticeText}from'../ui/common'
import{cleanEngineError,mediaCover,episodeNo,seasonNo}from'../lib/media'
import{fmtUnit}from'../lib/util'
import{fetchVideosCached,normalizeRemoteVideos,preferRemembered,AnimeVideo}from'./media-player'

export type DlKind='anime'|'series'|'movie'
const api=()=>window.novelReader as any
export const downloadsSupported=()=>typeof api()?.dlStart==='function'

// ---- Store: one subscription to the main process, shared by every button --------
let items:VideoDownload[]=[],base='',loaded=false,listening=false
const subs=new Set<()=>void>()
const emit=()=>{for(const f of subs)f()}
export async function refreshDownloads(){if(!downloadsSupported())return items;if(!listening){listening=true;api().onDownloadsChanged?.(()=>{refreshDownloads()});watchNetwork();window.addEventListener('online',()=>{refreshDownloads()})}try{const[list,b]=await Promise.all([api().dlList(),base?Promise.resolve(base):api().dlBase()]);items=[...follow(pace(Array.isArray(list)?list:[])),...waitingItems()];base=String(b||'');loaded=true;emit()}catch{}return items}

// ---- Speed and time left, from what the engine reports between two lists ----------
const paces=new Map<string,{at:number,bytes:number,speed:number}>()
function pace(list:VideoDownload[]):VideoDownload[]{
 const now=Date.now(),seen=new Set<string>()
 const out=list.map(d=>{
  if(d.state!=='downloading'||!d.bytes)return d
  seen.add(d.id);const p=paces.get(d.id)
  // A first report, a long silence or bytes going back (another stream took over) start the measure again.
  if(!p||now-p.at>15000||d.bytes<p.bytes){paces.set(d.id,{at:now,bytes:d.bytes,speed:0});return d}
  if(now-p.at>=900){const v=(d.bytes-p.bytes)/((now-p.at)/1000);p.speed=p.speed?p.speed*0.6+v*0.4:v;p.at=now;p.bytes=d.bytes}
  if(!(p.speed>0))return d
  const all=d.progress>0.02?d.bytes/d.progress:0
  return{...d,speed:p.speed,left:all>d.bytes?Math.round((all-d.bytes)/p.speed):undefined}
 })
 for(const id of[...paces.keys()])if(!seen.has(id))paces.delete(id)
 return out
}

// ---- Wi-Fi only (phone): episodes wait for Wi-Fi instead of using mobile data -----
// A download asked for on mobile data waits in a list; one running when the phone
// leaves Wi-Fi is stopped and waits too. Both start again on Wi-Fi.
// A download asked for is remembered (ARGS) with what is needed to ask for it again,
// until it is finished or the user gives it up:
//   live   the engine was given it (it is in its queue, or was when the app closed)
//   tries  automatic new tries used after failures; cuts: restarts after the app closed
//   hold   'net' = waits for the connection, 'retry' = tried again at `due`
//   err    the last failure; without `hold` it is final and waits for the user
type Job={kind:DlKind,media:any,ep:any,index:number,id?:string,live?:boolean,at?:number,tries?:number,cuts?:number,hold?:'net'|'retry',due?:number,err?:string}
const WAIT='dlWifiWait',ARGS='dlArgs'
const net=()=>(window as any).Capacitor?.Plugins?.Net
export const wifiSupported=()=>typeof net()?.status==='function'
export const wifiOnlyOn=()=>wifiSupported()&&localStorage.getItem('dlWifiOnly')==='1'
const lsList=(k:string):any[]=>{try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
const light=(m:any)=>({id:m?.id,url:m?.url,path:m?.path,name:m?.name,title:m?.title,sourceId:m?.sourceId,sourceName:m?.sourceName,thumbnail:m?.thumbnail,thumbnail_url:m?.thumbnail_url,cover:m?.cover})
const lightEp=(ep:any)=>({url:ep?.url,path:ep?.path,name:ep?.name,title:ep?.title,episode_number:ep?.episode_number,number:ep?.number})
const jobKey=(j:{media:any,ep:any})=>mediaIdOf(j.media)+'|'+episodeKey(j.ep)
const itemKey=(d:VideoDownload)=>d.mediaId+'|'+d.episodeUrl
const waitList=():Job[]=>lsList(WAIT)
const saveWait=(l:Job[])=>localStorage.setItem(WAIT,JSON.stringify(l.slice(-300)))
const readJobs=():Job[]=>lsList(ARGS)
const writeJobs=(l:Job[])=>{try{localStorage.setItem(ARGS,JSON.stringify(l.slice(-600)))}catch{}}
const forgetJob=(key:string)=>{const l=readJobs(),rest=l.filter(j=>jobKey(j)!==key);if(rest.length!==l.length)writeJobs(rest)}
// A job as a line of the list (what the engine does not know: waiting for Wi-Fi, cut, failed before the app closed).
const jobItem=(j:Job,id:string):VideoDownload=>({id,kind:j.kind,mediaId:mediaIdOf(j.media),mediaName:String(j.media?.name||j.media?.title||''),cover:mediaCover(j.media)||'',episodeUrl:episodeKey(j.ep),episodeName:String(j.ep?.name||j.ep?.title||''),episodeNo:episodeNo(j.ep,j.index+1),mediaKey:playerKey(j.kind,j.media,j.ep,j.index),state:'queued',progress:0})
function waitingItems():VideoDownload[]{return waitList().map(j=>({...jobItem(j,'wifi:'+jobKey(j)),wifi:true}))}

// ---- Downloads that failed or were cut are taken up again -------------------------
// A failure is tried again with fresh links (they expire): at once, two minutes later,
// then ten minutes later; after that it waits for the user. Without a connection it
// waits for it instead of failing. A download the engine no longer knows was cut by
// the app closing: it starts again (the engine goes on from what it had saved).
const RETRY_AFTER=[0,120e3,600e3],CUTS=3
const online=()=>typeof navigator==='undefined'||navigator.onLine!==false
const starting=new Set<string>()
let firstList=true,wake:any=null,restarts:Promise<void>=Promise.resolve()
function failJob(j:Job,msg:string){
 const n=j.tries||0
 if(!online())return Object.assign(j,{hold:'net',due:undefined,err:msg})
 if(/no space left/i.test(msg)||n>=RETRY_AFTER.length)return Object.assign(j,{hold:undefined,due:undefined,err:msg||'failed'})
 return Object.assign(j,{tries:n+1,hold:'retry',due:Date.now()+RETRY_AFTER[n],err:msg})
}
async function again(j:Job){
 const key=jobKey(j)
 try{await startEpisodeDownload(j.kind,j.media,j.ep,j.index,true)}
 // Not even the links could be fetched: it counts as a failed try.
 catch(e:any){const l=readJobs(),r=l.find(x=>jobKey(x)===key);if(r){r.live=true;failJob(r,cleanEngineError(e));writeJobs(l)}}
 finally{starting.delete(key)}
 refreshDownloads()
}
function follow(list:VideoDownload[]):VideoDownload[]{
 const jobs=readJobs();if(!jobs.length){firstList=false;return list}
 const by=new Map(list.map(d=>[itemKey(d),d])),now=Date.now(),out=[...list],keep:Job[]=[],go:Job[]=[],before=JSON.stringify(jobs);let next=0
 for(const j of jobs){
  const key=jobKey(j),d=by.get(key)
  if(d?.state==='done')continue // finished: nothing left to remember
  keep.push(j)
  const show=(p:Partial<VideoDownload>)=>{const item={...(d||jobItem(j,j.id||'job:'+key)),...p},i=d?out.indexOf(d):-1;if(i>=0)out[i]=item;else out.push(item)}
  if(starting.has(key)){if(!d||d.state==='error')show({state:'queued',error:'',hold:'start'});continue}
  if(d&&d.state!=='error'){if(j.hold||j.err)Object.assign(j,{hold:undefined,due:undefined,err:undefined});continue}
  // Never given to the engine (its links could not be fetched) and nothing of it there: nothing to follow.
  if(!j.live){if(!d)keep.pop();continue}
  if(!j.hold&&!j.err){
   if(d)failJob(j,d.error||'')
   // The engine does not know it any more. (A list asked for just before the start can still miss it: five seconds are given.)
   else if(firstList||now-(j.at||0)>5000){if((j.cuts||0)<CUTS)Object.assign(j,{cuts:(j.cuts||0)+1,hold:'retry',due:now+(firstList?4000:1000)});else j.err='interrupted'}
   else continue
  }
  if(j.hold==='net'&&online())Object.assign(j,{hold:'retry',due:now+3000})
  if(j.hold==='retry'){
   if(now>=(j.due||0)){Object.assign(j,{hold:undefined,due:undefined});go.push({...j});show({state:'queued',error:'',hold:'start'});continue}
   next=next?Math.min(next,j.due!):j.due!
  }
  if(j.hold)show({state:'queued',error:'',hold:j.hold,retryAt:j.due})
  else if(!d)show({state:'error',error:j.err||''})
 }
 firstList=false
 if(JSON.stringify(keep)!==before)writeJobs(keep)
 clearTimeout(wake);if(next)wake=setTimeout(refreshDownloads,Math.max(250,next-Date.now()+50))
 // One after the other, in the order they were asked for: twenty at once would look like an attack to the source.
 for(const j of go){starting.add(jobKey(j));restarts=restarts.then(()=>again(j))}
 return out
}
// Whether a failed download can be asked for again from the Downloads page.
export const canRetry=(d:VideoDownload)=>readJobs().some(j=>jobKey(j)===itemKey(d))
export async function retryDownload(d:VideoDownload){const j=readJobs().find(x=>jobKey(x)===itemKey(d));if(!j)return;return startEpisodeDownload(j.kind,j.media,j.ep,j.index)}
// Give a download up for good: forgotten here, and nothing of it kept on the disk.
export async function removeDownload(d:{id:string,mediaId?:string,episodeUrl?:string}){if(d.mediaId!=null)forgetJob(d.mediaId+'|'+d.episodeUrl);try{await api().dlRemove(d.id)}catch{};return refreshDownloads()}
export async function clearDownloads(){writeJobs([]);saveWait([]);try{await api().dlClear()}catch{};return refreshDownloads()}
async function onWifi(){const n=net();if(!n?.status)return true;try{const s=await n.status();return!!s.unmetered&&!!s.connected}catch{return true}}
function wait(job:Job){const l=waitList().filter(j=>jobKey(j)!==jobKey(job));l.push({kind:job.kind,media:light(job.media),ep:lightEp(job.ep),index:job.index});saveWait(l);forgetJob(jobKey(job))}
// Cancel a download, or take an episode off the Wi-Fi list.
export async function cancelDownload(id:string){if(id.startsWith('wifi:')){saveWait(waitList().filter(j=>'wifi:'+jobKey(j)!==id));return refreshDownloads()}return removeDownload(items.find(x=>x.id===id)||{id})}
let flushing=false
async function flushWifi(){if(flushing)return;flushing=true;try{const l=waitList();if(!l.length)return;saveWait([]);for(const j of l){try{await startEpisodeDownload(j.kind,j.media,j.ep,j.index)}catch{}}}finally{flushing=false;refreshDownloads()}}
let watching=false
function watchNetwork(){if(watching||!wifiSupported())return;watching=true
 const on=async(s:any)=>{if(!s?.connected)return
  if(s.unmetered){flushWifi();return}
  if(!wifiOnlyOn())return
  // Left Wi-Fi: what is downloading stops and waits.
  const args:Record<string,Job>=Object.fromEntries(readJobs().map((j:Job)=>[jobKey(j),j]))
  for(const d of items)if(!(d as any).wifi&&(d.state==='queued'||d.state==='downloading')){const j=args[itemKey(d)];if(!j)continue;wait(j);try{await api().dlCancel(d.id);await api().dlRemove?.(d.id)}catch{}}
  refreshDownloads()}
 try{net().addListener?.('change',on)}catch{}
 net().status().then((s:any)=>{if(s?.unmetered)flushWifi()}).catch(()=>{})}
export function useDownloads(){
 const[,bump]=useState(0)
 useEffect(()=>{const f=()=>bump(x=>x+1);subs.add(f);if(!loaded)refreshDownloads();return()=>{subs.delete(f)}},[])
 return items
}
export const episodeKey=(ep:any)=>String(ep?.url||ep?.path||'')
export const findDownload=(list:VideoDownload[],mediaId:string,ep:any)=>list.find(d=>d.mediaId===String(mediaId)&&d.episodeUrl===episodeKey(ep))
export const mediaIdOf=(media:any)=>String(media?.id||media?.url||media?.name||'')
// Same keys as the players in main.tsx, so the resume position is shared.
export function playerKey(kind:DlKind,media:any,ep:any,index=0){const id=mediaIdOf(media);if(kind==='movie')return 'movie:'+id;if(kind==='series')return 'series:'+id+':'+String(ep?.url||ep?.path||ep?.number||index);return 'anime:'+id+':'+String(ep?.url||ep?.path||ep?.number||ep?.name||'episode')}

// A finished download as a video object for <AnimeVideo>.
export function offlineVideo(d:VideoDownload){
 const root=(base||'')+'/'+encodeURIComponent(d.id)+'/'
 return{streamUrl:root+(d.file||''),videoTitle:t('Downloaded')+(d.title?' · '+d.title:''),sourceName:t('On this PC'),offline:true,audioTracks:[],subtitleTracks:(d.subtitles||[]).map(s=>({label:s.label||s.lang||t('Subtitles'),lang:s.lang,streamUrl:root+s.file}))}
}
export async function offlineVideoFor(media:any,ep:any){if(!downloadsSupported())return null;const list=loaded?items:await refreshDownloads();const d=findDownload(list,mediaIdOf(media),ep);return d&&d.state==='done'?offlineVideo(d):null}

// Resolve the episode's streams (remembered server first) and queue the download.
// `auto`: a new try made by the app itself (the links are fetched again, the count of tries is kept).
export async function startEpisodeDownload(kind:DlKind,media:any,ep:any,index=0,auto=false){
 const sourceId=String(media?.sourceId||''),url=episodeKey(ep),key=mediaIdOf(media)+'|'+url
 if(!sourceId||!url)throw new Error(t('This episode is missing its source.'))
 if(wifiOnlyOn()&&!(await onWifi())){wait({kind,media,ep,index});refreshDownloads();return{id:'wifi:'+key,wifi:true}}
 starting.add(key)
 try{
 {const l=readJobs(),old=l.find(j=>jobKey(j)===key),rest=l.filter(j=>jobKey(j)!==key);rest.push({kind,media:light(media),ep:lightEp(ep),index,id:old?.id,tries:auto?old?.tries||0:0,cuts:auto?old?.cuts||0:0});writeJobs(rest)}
 const data:any=await fetchVideosCached(sourceId,url,auto)
 const videos=Array.isArray(data)?data:(data?.videos||data?.items||data?.list||[])
 const ordered=preferRemembered(normalizeRemoteVideos(videos,sourceId,media.sourceName||''),media)
 const candidates=ordered.filter((v:any)=>/\/api\/v1\/(hls|proxy)\?/.test(String(v.streamUrl||''))).slice(0,6).map((v:any)=>({url:String(v.streamUrl),type:/\/api\/v1\/hls\?/.test(String(v.streamUrl))?'hls' as const:'file' as const,title:String(v.videoTitle||v.title||v.quality||''),subtitles:(v.subtitleTracks||[]).filter((s:any)=>s?.streamUrl).map((s:any)=>({url:String(s.streamUrl),label:String(s.label||s.lang||s.language||''),lang:String(s.lang||s.language||'')}))}))
 // Preferred quality (Downloads page): servers whose label fits under the cap come first.
 const cap=Number(localStorage.getItem('dlMaxHeight'))||0,hOf=(c:any)=>Number((/(\d{3,4})p/i.exec(c.title)||[])[1])||0
 if(cap)candidates.sort((a:any,b:any)=>{const ha=hOf(a),hb=hOf(b),fa=!ha||ha<=cap,fb=!hb||hb<=cap;return(fb?1:0)-(fa?1:0)||(fa?hb-ha:ha-hb)})
 if(!candidates.length)throw new Error(t('This episode has no stream that can be downloaded.'))
 const r=await api().dlStart({kind,mediaId:mediaIdOf(media),mediaName:String(media.name||media.title||''),cover:mediaCover(media)||'',episodeUrl:url,episodeName:String(ep?.name||ep?.title||''),episodeNo:episodeNo(ep,index+1),mediaKey:playerKey(kind,media,ep,index),candidates})
 {const l=readJobs(),j=l.find(x=>jobKey(x)===key);if(j){Object.assign(j,{live:true,at:Date.now(),id:String(r?.id||j.id||''),hold:undefined,due:undefined,err:undefined});writeJobs(l)}}
 refreshDownloads();return r
 }finally{starting.delete(key)}
}
// Quality cap and bandwidth limit, kept in the main process.
export function applyDownloadSettings(){if(!downloadsSupported())return;api().dlConfigure?.({maxHeight:Number(localStorage.getItem('dlMaxHeight'))||0,limit:(Number(localStorage.getItem('dlLimitMB'))||0)*1e6}).catch(()=>{})}
// ---- Several episodes at once, and automatic clean-up of watched downloads --------
export async function startBatchDownload(kind:DlKind,media:any,eps:any[],from:number,count:number,list:VideoDownload[],onProgress?:(done:number,total:number)=>void){
 const todo=eps.map((ep,i)=>({ep,i})).slice(Math.max(0,from)).filter(x=>!findDownload(list,mediaIdOf(media),x.ep)).slice(0,count)
 let done=0,failed=0,lastError=''
 for(const x of todo){onProgress?.(done,todo.length);try{await startEpisodeDownload(kind,media,x.ep,x.i)}catch(e:any){failed++;lastError=cleanEngineError(e)}done++}
 onProgress?.(done,todo.length);return{queued:todo.length-failed,failed,lastError}
}
const PENDING='dlAutoDeletePending'
export const autoDeleteOn=()=>localStorage.getItem('dlAutoDelete')==='1'
const readPending=():string[]=>{try{return JSON.parse(localStorage.getItem(PENDING)||'[]')}catch{return[]}}
// A finished episode is deleted once something else plays (or at the next start),
// never while it is still on screen.
export function noteWatched(key:string){if(!autoDeleteOn()||!key)return;const p=readPending();if(!p.includes(key)){p.push(key);localStorage.setItem(PENDING,JSON.stringify(p.slice(-200)))}}
export async function flushAutoDeletes(keep=''){
 if(!downloadsSupported())return 0
 const p=readPending();if(!p.length)return 0
 const list=await refreshDownloads();let n=0;const left:string[]=[]
 for(const key of p){if(key===keep){left.push(key);continue}const d=list.find(x=>x.state==='done'&&x.mediaKey===key);if(d&&autoDeleteOn()){try{await api().dlRemove(d.id);n++}catch{left.push(key)}}}
 localStorage.setItem(PENDING,JSON.stringify(left));if(n)refreshDownloads();return n
}
export function BatchDownload({kind,media,eps,list,onError}:{kind:DlKind,media:any,eps:any[],list:VideoDownload[],onError?:(m:string)=>void}){
 const[count,setCount]=useState(()=>Number(localStorage.getItem('dlBatchCount'))||5),[busy,setBusy]=useState<{done:number,total:number}|null>(null),[msg,setMsg]=useState(''),[wifi,setWifi]=useState(wifiOnlyOn())
 if(!downloadsSupported()||eps.length<2)return null
 // Start after the last episode watched (or at the one in progress).
 const id=mediaIdOf(media);let from=0
 try{const info=JSON.parse(localStorage.getItem('lastEpInfo:'+id)||'null');if(info?.url){const i=eps.findIndex((e:any)=>episodeKey(e)===info.url);if(i>=0){const pos=JSON.parse(localStorage.getItem('mediapos:'+playerKey(kind,media,eps[i],i))||'null');from=pos?.done?i+1:i}}}catch{}
 const left=eps.slice(from).filter(e=>!findDownload(list,id,e)).length
 // -1: the rest of this season, -2: every episode after this one.
 const seasonEnd=(()=>{const sn=seasonNo(eps[Math.min(from,eps.length-1)]);let j=from;while(j<eps.length&&seasonNo(eps[j])===sn)j++;return j})()
 const howMany=count===-1?eps.slice(from,seasonEnd).filter(e=>!findDownload(list,id,e)).length:count===-2?left:count
 const seasons=new Set(eps.map(seasonNo)).size
 const all=eps.filter(e=>findDownload(list,id,e)?.state==='done').length
 const go=async()=>{setBusy({done:0,total:Math.min(howMany,left)});setMsg('');try{const r=await startBatchDownload(kind,media,eps,from,howMany,list,(done,total)=>setBusy({done,total}));setMsg(r.failed?t('{ok} queued, {failed} could not start: {error}',{ok:r.queued,failed:r.failed,error:r.lastError}):(wifiOnlyOn()&&!(await onWifi())?plural(r.queued,'{n} episode will download on Wi-Fi.','{n} episodes will download on Wi-Fi.'):plural(r.queued,'{n} episode queued.','{n} episodes queued.')));if(r.failed&&!r.queued)onError?.(r.lastError)}finally{setBusy(null)}}
 return <div className="batch-dl"><span className="batch-dl-info">{all?(wifiSupported()?plural(all,'{n} episode on this phone','{n} episodes on this phone'):plural(all,'{n} episode on this PC','{n} episodes on this PC')):t('Watch offline')}</span>
  {left>0?<><select aria-label={t('How many episodes')} value={count} disabled={!!busy} onChange={e=>{const n=Number(e.target.value);setCount(n);localStorage.setItem('dlBatchCount',String(n))}}>{[3,5,10,25].map(n=><option key={n} value={n}>{n}</option>)}{seasons>1&&<option value={-1}>{t('The rest of the season')}</option>}<option value={-2}>{t('All the next ones')}</option></select><button disabled={!!busy} onClick={go}>{busy?t('Preparing {done} / {total}…',{done:busy.done+1>busy.total?busy.total:busy.done+1,total:busy.total}):'⤓ '+t('Download the next episodes')}</button></>:<span className="batch-dl-info">{t('All the next episodes are downloaded.')}</span>}
  {wifiSupported()&&<label className="settings-check batch-dl-wifi"><input type="checkbox" checked={wifi} onChange={e=>{setWifi(e.target.checked);localStorage.setItem('dlWifiOnly',e.target.checked?'1':'0');if(!e.target.checked)flushWifi()}}/> {t('Wi-Fi only')}</label>}
  {msg&&<small className="batch-dl-msg" role="status">{msg}</small>}
 </div>
}
export const fmtBytes=(n:number)=>!n?fmtUnit(0,0,'MB'):n>=1e9?fmtUnit(n/1e9,1,'GB'):fmtUnit(Math.max(0.1,n/1e6),n>=1e8?0:1,'MB')
const pct=(d:VideoDownload)=>t('{n}%',{n:Math.round(d.progress*100)})
const clock=(ms:number)=>new Date(ms).toLocaleTimeString(getLang()==='fr'?'fr-FR':'en-US',{hour:'2-digit',minute:'2-digit'})
const leftText=(s:number)=>s<60?t('{n} s',{n:Math.max(1,Math.round(s))}):s<3600?t('{n} min',{n:Math.round(s/60)}):t('{h} h {m} min',{h:Math.floor(s/3600),m:Math.round(s%3600/60)})
// What went wrong, in plain words; the engine's own message stays under "Technical details".
export function downloadError(raw:string,short=false){
 const x=String(raw||'').trim(),cut=/^interrupted$/i.test(x)
 const nice=/no space left|enospc/i.test(x)?t('There is no room left to save this video.')
  :cut?t('The download was interrupted.')
  :/HTTP (401|403|404|410)\b/.test(x)?t('The link to this video expired or was removed.')
  :/HTTP (5\d\d|408|429)\b/.test(x)?t('The video server is not answering.')
  :/stopped answering|connection|fetch failed|failed to (fetch|connect)|network|terminated|timed? ?out|socket|econn|unexpected end|reset|abort|resolve host/i.test(x)?t('The connection was cut during the download.')
  :/empty (playlist|file)|no variant|no downloadable stream/i.test(x)?t('This server sent nothing that can be saved.'):''
 return!nice?x:short||cut?nice:nice+' — '+x
}
// Where a download stands, for the Downloads page.
function stateText(d:VideoDownload){
 if(d.state==='error')return t('Failed')
 if(d.state==='queued')return d.wifi?t('Waiting for Wi-Fi'):d.hold==='net'?t('Waiting for the connection'):d.hold==='retry'?(d.retryAt&&d.retryAt-Date.now()>45e3?t('New try at {time}',{time:clock(d.retryAt)}):t('Trying again soon')):d.hold==='start'?t('Preparing…'):t('Waiting')
 // Each piece stays whole: a narrow screen breaks the line between two of them.
 return[pct(d),d.bytes?fmtBytes(d.bytes):'',d.speed?fmtBytes(d.speed)+'/s':'',d.left?t('{time} left',{time:leftText(d.left)}):''].filter(Boolean).map(x=>x.replace(/ /g,'\u00a0')).join(' · ')
}

// ---- Per-episode button (EpisodeGrid renderExtra) -----------------------------
export function EpisodeDownload({kind,media,ep,index,list,onError,wide}:{kind:DlKind,media:any,ep:any,index:number,list:VideoDownload[],onError?:(msg:string)=>void,wide?:boolean}){
 const d=findDownload(list,mediaIdOf(media),ep),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false)
 useEffect(()=>{if(!confirm)return;const tm=setTimeout(()=>setConfirm(false),3000);return()=>clearTimeout(tm)},[confirm])
 if(!downloadsSupported())return null
 const cls=(x:string)=>(wide?'dl-wide ':'ep-dl ')+x,txt=(icon:string,label:string)=>wide?icon+' '+label:icon
 const start=async()=>{setBusy(true);try{await startEpisodeDownload(kind,media,ep,index)}catch(e:any){onError?.(cleanEngineError(e))}finally{setBusy(false)}}
 if(!d)return <button className={cls(busy?'busy':'')} disabled={busy} title={t('Download for offline viewing')} aria-label={busy?t('Preparing…'):t('Download for offline viewing')} onClick={start}>{busy?txt('…',t('Preparing…')):txt('⤓',t('Download'))}</button>
 if(d.state==='done')return <button className={cls('done'+(confirm?' confirm':''))} title={confirm?t('Click again to delete the download'):t('Downloaded ({size}). Plays without internet. Click to delete.',{size:fmtBytes(d.size||0)})} aria-label={confirm?t('Delete the download'):t('Downloaded')} onClick={()=>{if(confirm){removeDownload(d);setConfirm(false)}else setConfirm(true)}}>{confirm?txt('×',t('Delete the download')):wide?'✓ '+t('Downloaded'):'⤓'}</button>
 if(d.state==='error')return <button className={cls('error')} title={t('Download failed: {error}. Click to try again.',{error:downloadError(d.error||'',true).replace(/\.$/,'')})} aria-label={t('Retry the download')} onClick={start}>{txt('!',t('Retry the download'))}</button>
 // The state is said first, in words (the compact button only shows a sign), then what the
 // button does: the name of a button holds its visible text.
 const words=d.wifi?t('Waiting for Wi-Fi'):d.hold==='net'?t('Waiting for the connection'):d.hold==='retry'?t('Trying again soon'):d.state==='queued'?(d.hold==='start'?t('Preparing…'):t('Waiting')):wide?t('Downloading… {pct}%',{pct:Math.round(d.progress*100)}):pct(d)
 const shown=d.state==='queued'?txt(d.wifi||d.hold==='net'?'📶':d.hold==='retry'?'↻':'…',words):words
 return <button className={cls('active')} title={d.wifi?t('Waiting for Wi-Fi… Click to cancel.'):d.hold==='net'?t('Waiting for the connection… Click to cancel.'):d.hold==='retry'?t('It failed; a new try is coming. Click to cancel.'):d.state==='queued'?t('Waiting to download… Click to cancel.'):t('Downloading… {pct}%. Click to cancel.',{pct:Math.round(d.progress*100)})} aria-label={words+' · '+t('Cancel the download')} onClick={()=>cancelDownload(d.id)}>{shown}</button>
}

// ---- Downloads page ---------------------------------------------------------------
export function DownloadsPage(){
 const[auto,setAuto]=useState(autoDeleteOn()),[maxH,setMaxH]=useState(()=>localStorage.getItem('dlMaxHeight')||'0'),[limit,setLimit]=useState(()=>localStorage.getItem('dlLimitMB')||'0')
 useEffect(()=>{flushAutoDeletes()},[])
 const list=useDownloads(),[playing,setPlaying]=useState<VideoDownload|null>(null),[usage,setUsage]=useState<{bytes:number,count:number}|null>(null),[confirmAll,setConfirmAll]=useState(false),[note,setNote]=useState('')
 useEffect(()=>{if(downloadsSupported())api().dlUsage().then(setUsage).catch(()=>{})},[list])
 if(!downloadsSupported())return <div className="media-search-page"><header><div><h1>{t('Downloads')}</h1></div></header><section className="panel"><p>{t('Downloads are available in the Windows app.')}</p></section></div>
 const active=list.filter(d=>d.state!=='done'),done=list.filter(d=>d.state==='done')
 const groups=new Map<string,VideoDownload[]>();for(const d of done){const k=d.kind+':'+d.mediaId;if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(d)}
 const kindLabel=(k:string)=>k==='movie'?t('MOVIE'):k==='series'?t('SERIES'):t('ANIME')
 return <div className="media-search-page downloads-page"><header><div><h1>{t('Downloads')}</h1><p>{t('Episodes and movies saved on this PC. They play without internet, with their subtitles.')}</p></div></header>
  <div className="dl-settings"><label>{t('Quality')}<select value={maxH} onChange={e=>{setMaxH(e.target.value);localStorage.setItem('dlMaxHeight',e.target.value);applyDownloadSettings()}}><option value="0">{t('Best (up to 1080p)')}</option><option value="720">720p</option><option value="480">480p</option><option value="360">{t('360p (smallest)')}</option></select></label><label>{t('Speed limit')}<select value={limit} onChange={e=>{setLimit(e.target.value);localStorage.setItem('dlLimitMB',e.target.value);applyDownloadSettings()}}><option value="0">{t('No limit')}</option>{['1','2','5','10'].map(v=><option key={v} value={v}>{fmtUnit(Number(v),0,'MB')+'/s'}</option>)}</select></label></div>
  {wifiSupported()&&<label className="settings-check dl-auto"><input type="checkbox" defaultChecked={wifiOnlyOn()} onChange={e=>{localStorage.setItem('dlWifiOnly',e.target.checked?'1':'0');if(!e.target.checked)flushWifi()}}/> {t('Download on Wi-Fi only (episodes wait for Wi-Fi instead of using mobile data)')}</label>}
  <label className="settings-check dl-auto"><input type="checkbox" checked={auto} onChange={e=>{setAuto(e.target.checked);localStorage.setItem('dlAutoDelete',e.target.checked?'1':'0')}}/> {t('Delete a downloaded episode automatically once I have watched it')}</label>
  <div className="downloads-bar"><span>{usage?plural(usage.count,'{n} video','{n} videos')+' · '+fmtBytes(usage.bytes):''}</span><div className="libraryactions">{api().dlOpenFolder&&<button onClick={()=>api().dlOpenFolder()}>{t('Open folder')}</button>}{done.length>0&&(confirmAll?<button className="danger" onClick={()=>{clearDownloads();setConfirmAll(false);setPlaying(null)}}>{t('Delete all downloads')}</button>:<button onClick={()=>setConfirmAll(true)}>{t('Free up space…')}</button>)}</div></div>
  {playing&&<section className="panel media-player-top"><div className="media-player-title"><div><span className="media-kicker">{t('OFFLINE')}</span><h2>{playing.mediaName}{playing.kind!=='movie'&&playing.episodeName?' · '+playing.episodeName:''}</h2></div><button onClick={()=>setPlaying(null)}>{t('Close')}</button></div><AnimeVideo key={playing.id} video={offlineVideo(playing)} mediaKey={playing.mediaKey}/></section>}
  {note&&<div className="anime-toast error" role="alert"><NoticeText text={note}/></div>}
  {active.length>0&&<section className="panel"><h2>{t('In progress')}</h2><ul className="downloads-list">{active.map(d=><li key={d.id} className={'dl-row '+d.state}><div><b>{d.mediaName}</b><small>{d.kind==='movie'?kindLabel(d.kind):d.episodeName||t('Episode {n}',{n:d.episodeNo||''})}</small>{d.state==='error'?<NoticeText text={downloadError(d.error||'')}/>:<div className="libbar"><span style={{width:Math.round(d.progress*100)+'%'}}/></div>}</div><span className="dl-state">{stateText(d)}</span><span className="dl-actions">{d.state==='error'&&canRetry(d)&&<button className="primary" onClick={()=>{setNote('');retryDownload(d).catch((e:any)=>setNote(cleanEngineError(e)))}}>{t('Retry')}</button>}<button onClick={()=>cancelDownload(d.id)}>{d.state==='error'?t('Remove'):t('Cancel')}</button></span></li>)}</ul></section>}
  {done.length===0&&active.length===0&&<EmptyState icon="download" title={t('No downloads yet')} text={t('Open an anime, a series or a movie and use the ⤓ button on an episode to keep it on this PC.')}/>}
  {[...groups.values()].map(g=>{const first=g[0];return <section className="panel dl-group" key={first.kind+first.mediaId}><div className="dl-head"><Cover src={first.cover||''} name={first.mediaName}/><div><span className="media-kicker">{kindLabel(first.kind)}</span><h2>{first.mediaName}</h2><small>{plural(g.length,'{n} video','{n} videos')+' · '+fmtBytes(g.reduce((n,d)=>n+(d.size||0),0))}</small></div></div>
   <ul className="downloads-list">{g.sort((a,b)=>(a.episodeNo||0)-(b.episodeNo||0)).map(d=><li key={d.id} className={'dl-row'+(playing?.id===d.id?' on':'')}><div><b>{d.kind==='movie'?first.mediaName:d.episodeName||t('Episode {n}',{n:d.episodeNo||''})}</b><small>{fmtBytes(d.size||0)}{d.subtitles?.length?' · '+plural(d.subtitles.length,'{n} subtitle','{n} subtitles'):''}</small></div><button className="primary" onClick={()=>setPlaying(d)}>{'▶ '+t('Play')}</button><button onClick={()=>{removeDownload(d);if(playing?.id===d.id)setPlaying(null)}}>{t('Delete')}</button></li>)}</ul></section>})}
 </div>
}
