// Offline video downloads: shared store, per-episode button, Downloads page and the
// helpers main.tsx uses to play a downloaded episode instead of the online stream.
// The work itself happens in the main process (electron/video-downloads.cjs).
import React,{useEffect,useState}from'react'
import{t,plural}from'../i18n'
import{Cover,NoticeText}from'../ui/common'
import{cleanEngineError,mediaCover,episodeNo}from'../lib/media'
import{fetchVideosCached,normalizeRemoteVideos,preferRemembered,AnimeVideo}from'./media-player'

export type DlKind='anime'|'series'|'movie'
const api=()=>window.novelReader as any
export const downloadsSupported=()=>typeof api()?.dlStart==='function'

// ---- Store: one subscription to the main process, shared by every button --------
let items:VideoDownload[]=[],base='',loaded=false,listening=false
const subs=new Set<()=>void>()
const emit=()=>{for(const f of subs)f()}
export async function refreshDownloads(){if(!downloadsSupported())return items;if(!listening){listening=true;api().onDownloadsChanged?.(()=>{refreshDownloads()})}try{const[list,b]=await Promise.all([api().dlList(),base?Promise.resolve(base):api().dlBase()]);items=Array.isArray(list)?list:[];base=String(b||'');loaded=true;emit()}catch{}return items}
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
export async function startEpisodeDownload(kind:DlKind,media:any,ep:any,index=0){
 const sourceId=String(media?.sourceId||''),url=episodeKey(ep)
 if(!sourceId||!url)throw new Error(t('This episode is missing its source.'))
 const data:any=await fetchVideosCached(sourceId,url)
 const videos=Array.isArray(data)?data:(data?.videos||data?.items||data?.list||[])
 const ordered=preferRemembered(normalizeRemoteVideos(videos,sourceId,media.sourceName||''),media)
 const candidates=ordered.filter((v:any)=>/\/api\/v1\/(hls|proxy)\?/.test(String(v.streamUrl||''))).slice(0,6).map((v:any)=>({url:String(v.streamUrl),type:/\/api\/v1\/hls\?/.test(String(v.streamUrl))?'hls' as const:'file' as const,title:String(v.videoTitle||v.title||v.quality||''),subtitles:(v.subtitleTracks||[]).filter((s:any)=>s?.streamUrl).map((s:any)=>({url:String(s.streamUrl),label:String(s.label||s.lang||s.language||''),lang:String(s.lang||s.language||'')}))}))
 // Preferred quality (Downloads page): servers whose label fits under the cap come first.
 const cap=Number(localStorage.getItem('dlMaxHeight'))||0,hOf=(c:any)=>Number((/(\d{3,4})p/i.exec(c.title)||[])[1])||0
 if(cap)candidates.sort((a:any,b:any)=>{const ha=hOf(a),hb=hOf(b),fa=!ha||ha<=cap,fb=!hb||hb<=cap;return(fb?1:0)-(fa?1:0)||(fa?hb-ha:ha-hb)})
 if(!candidates.length)throw new Error(t('This episode has no stream that can be downloaded.'))
 const r=await api().dlStart({kind,mediaId:mediaIdOf(media),mediaName:String(media.name||media.title||''),cover:mediaCover(media)||'',episodeUrl:url,episodeName:String(ep?.name||ep?.title||''),episodeNo:episodeNo(ep,index+1),mediaKey:playerKey(kind,media,ep,index),candidates})
 refreshDownloads();return r
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
 const[count,setCount]=useState(()=>Number(localStorage.getItem('dlBatchCount'))||5),[busy,setBusy]=useState<{done:number,total:number}|null>(null),[msg,setMsg]=useState('')
 if(!downloadsSupported()||eps.length<2)return null
 // Start after the last episode watched (or at the one in progress).
 const id=mediaIdOf(media);let from=0
 try{const info=JSON.parse(localStorage.getItem('lastEpInfo:'+id)||'null');if(info?.url){const i=eps.findIndex((e:any)=>episodeKey(e)===info.url);if(i>=0){const pos=JSON.parse(localStorage.getItem('mediapos:'+playerKey(kind,media,eps[i],i))||'null');from=pos?.done?i+1:i}}}catch{}
 const left=eps.slice(from).filter(e=>!findDownload(list,id,e)).length
 const all=eps.filter(e=>findDownload(list,id,e)?.state==='done').length
 const go=async()=>{setBusy({done:0,total:Math.min(count,left)});setMsg('');try{const r=await startBatchDownload(kind,media,eps,from,count,list,(done,total)=>setBusy({done,total}));setMsg(r.failed?t('{ok} queued, {failed} could not start: {error}',{ok:r.queued,failed:r.failed,error:r.lastError}):plural(r.queued,'{n} episode queued.','{n} episodes queued.'));if(r.failed&&!r.queued)onError?.(r.lastError)}finally{setBusy(null)}}
 return <div className="batch-dl"><span className="batch-dl-info">{all?plural(all,'{n} episode on this PC','{n} episodes on this PC'):t('Watch offline')}</span>
  {left>0?<><select aria-label={t('How many episodes')} value={count} disabled={!!busy} onChange={e=>{const n=Number(e.target.value);setCount(n);localStorage.setItem('dlBatchCount',String(n))}}>{[3,5,10,25].map(n=><option key={n} value={n}>{n}</option>)}</select><button disabled={!!busy} onClick={go}>{busy?t('Preparing {done} / {total}…',{done:busy.done+1>busy.total?busy.total:busy.done+1,total:busy.total}):'⤓ '+t('Download the next episodes')}</button></>:<span className="batch-dl-info">{t('All the next episodes are downloaded.')}</span>}
  {msg&&<small className="batch-dl-msg" role="status">{msg}</small>}
 </div>
}
export const fmtBytes=(n:number)=>!n?'0 MB':n>=1e9?(n/1e9).toFixed(1)+' GB':Math.max(0.1,n/1e6).toFixed(n>=1e8?0:1)+' MB'

// ---- Per-episode button (EpisodeGrid renderExtra) -----------------------------
export function EpisodeDownload({kind,media,ep,index,list,onError,wide}:{kind:DlKind,media:any,ep:any,index:number,list:VideoDownload[],onError?:(msg:string)=>void,wide?:boolean}){
 const d=findDownload(list,mediaIdOf(media),ep),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false)
 useEffect(()=>{if(!confirm)return;const tm=setTimeout(()=>setConfirm(false),3000);return()=>clearTimeout(tm)},[confirm])
 if(!downloadsSupported())return null
 const cls=(x:string)=>(wide?'dl-wide ':'ep-dl ')+x,txt=(icon:string,label:string)=>wide?icon+' '+label:icon
 const start=async()=>{setBusy(true);try{await startEpisodeDownload(kind,media,ep,index)}catch(e:any){onError?.(cleanEngineError(e))}finally{setBusy(false)}}
 if(!d)return <button className={cls(busy?'busy':'')} disabled={busy} title={t('Download for offline viewing')} aria-label={t('Download for offline viewing')} onClick={start}>{busy?txt('…',t('Preparing…')):txt('⤓',t('Download'))}</button>
 if(d.state==='done')return <button className={cls('done'+(confirm?' confirm':''))} title={confirm?t('Click again to delete the download'):t('Downloaded ({size}). Plays without internet. Click to delete.',{size:fmtBytes(d.size||0)})} aria-label={confirm?t('Delete the download'):t('Downloaded')} onClick={()=>{if(confirm){api().dlRemove(d.id).then(refreshDownloads);setConfirm(false)}else setConfirm(true)}}>{confirm?txt('×',t('Delete the download')):txt('✓',t('Downloaded'))}</button>
 if(d.state==='error')return <button className={cls('error')} title={t('Download failed: {error}. Click to try again.',{error:d.error||''})} aria-label={t('Retry the download')} onClick={start}>{txt('!',t('Retry the download'))}</button>
 return <button className={cls('active')} title={d.state==='queued'?t('Waiting to download… Click to cancel.'):t('Downloading… {pct}%. Click to cancel.',{pct:Math.round(d.progress*100)})} aria-label={t('Cancel the download')} onClick={()=>api().dlCancel(d.id).then(refreshDownloads)}>{d.state==='queued'?txt('…',t('Waiting')):wide?t('Downloading… {pct}%',{pct:Math.round(d.progress*100)}):Math.round(d.progress*100)+'%'}</button>
}

// ---- Downloads page ---------------------------------------------------------------
export function DownloadsPage(){
 const[auto,setAuto]=useState(autoDeleteOn()),[maxH,setMaxH]=useState(()=>localStorage.getItem('dlMaxHeight')||'0'),[limit,setLimit]=useState(()=>localStorage.getItem('dlLimitMB')||'0')
 useEffect(()=>{flushAutoDeletes()},[])
 const list=useDownloads(),[playing,setPlaying]=useState<VideoDownload|null>(null),[usage,setUsage]=useState<{bytes:number,count:number}|null>(null),[confirmAll,setConfirmAll]=useState(false)
 useEffect(()=>{if(downloadsSupported())api().dlUsage().then(setUsage).catch(()=>{})},[list])
 if(!downloadsSupported())return <div className="media-search-page"><header><div><h1>{t('Downloads')}</h1></div></header><section className="panel"><p>{t('Downloads are available in the Windows app.')}</p></section></div>
 const active=list.filter(d=>d.state!=='done'),done=list.filter(d=>d.state==='done')
 const groups=new Map<string,VideoDownload[]>();for(const d of done){const k=d.kind+':'+d.mediaId;if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(d)}
 const kindLabel=(k:string)=>k==='movie'?t('MOVIE'):k==='series'?t('SERIES'):t('ANIME')
 return <div className="media-search-page downloads-page"><header><div><h1>{t('Downloads')}</h1><p>{t('Episodes and movies saved on this PC. They play without internet, with their subtitles.')}</p></div></header>
  <div className="dl-settings"><label>{t('Quality')}<select value={maxH} onChange={e=>{setMaxH(e.target.value);localStorage.setItem('dlMaxHeight',e.target.value);applyDownloadSettings()}}><option value="0">{t('Best (up to 1080p)')}</option><option value="720">720p</option><option value="480">480p</option><option value="360">{t('360p (smallest)')}</option></select></label><label>{t('Speed limit')}<select value={limit} onChange={e=>{setLimit(e.target.value);localStorage.setItem('dlLimitMB',e.target.value);applyDownloadSettings()}}><option value="0">{t('No limit')}</option>{['1','2','5','10'].map(v=><option key={v} value={v}>{v+' MB/s'}</option>)}</select></label></div>
  <label className="settings-check dl-auto"><input type="checkbox" checked={auto} onChange={e=>{setAuto(e.target.checked);localStorage.setItem('dlAutoDelete',e.target.checked?'1':'0')}}/> {t('Delete a downloaded episode automatically once I have watched it')}</label>
  <div className="downloads-bar"><span>{usage?plural(usage.count,'{n} video','{n} videos')+' · '+fmtBytes(usage.bytes):''}</span><div className="libraryactions">{api().dlOpenFolder&&<button onClick={()=>api().dlOpenFolder()}>{t('Open folder')}</button>}{done.length>0&&(confirmAll?<button className="danger" onClick={()=>{api().dlClear().then(refreshDownloads);setConfirmAll(false);setPlaying(null)}}>{t('Delete all downloads')}</button>:<button onClick={()=>setConfirmAll(true)}>{t('Free up space…')}</button>)}</div></div>
  {playing&&<section className="panel media-player-top"><div className="media-player-title"><div><span className="media-kicker">{t('OFFLINE')}</span><h2>{playing.mediaName}{playing.kind!=='movie'&&playing.episodeName?' · '+playing.episodeName:''}</h2></div><button onClick={()=>setPlaying(null)}>{t('Close')}</button></div><AnimeVideo key={playing.id} video={offlineVideo(playing)} mediaKey={playing.mediaKey}/></section>}
  {active.length>0&&<section className="panel"><h2>{t('In progress')}</h2><ul className="downloads-list">{active.map(d=><li key={d.id} className={'dl-row '+d.state}><div><b>{d.mediaName}</b><small>{d.kind==='movie'?kindLabel(d.kind):d.episodeName||t('Episode {n}',{n:d.episodeNo||''})}</small>{d.state==='error'?<NoticeText text={d.error||''}/>:<div className="libbar"><span style={{width:Math.round(d.progress*100)+'%'}}/></div>}</div><span className="dl-state">{d.state==='queued'?t('Waiting'):d.state==='error'?t('Failed'):Math.round(d.progress*100)+'%'+(d.bytes?' · '+fmtBytes(d.bytes):'')}</span><button onClick={()=>(d.state==='error'?api().dlRemove(d.id):api().dlCancel(d.id)).then(refreshDownloads)}>{d.state==='error'?t('Remove'):t('Cancel')}</button></li>)}</ul></section>}
  {done.length===0&&active.length===0&&<section className="panel lib-empty"><h2>{t('No downloads yet')}</h2><p>{t('Open an anime, a series or a movie and use the ⤓ button on an episode to keep it on this PC.')}</p></section>}
  {[...groups.values()].map(g=>{const first=g[0];return <section className="panel dl-group" key={first.kind+first.mediaId}><div className="dl-head"><Cover src={first.cover||''} name={first.mediaName}/><div><span className="media-kicker">{kindLabel(first.kind)}</span><h2>{first.mediaName}</h2><small>{plural(g.length,'{n} video','{n} videos')+' · '+fmtBytes(g.reduce((n,d)=>n+(d.size||0),0))}</small></div></div>
   <ul className="downloads-list">{g.sort((a,b)=>(a.episodeNo||0)-(b.episodeNo||0)).map(d=><li key={d.id} className={'dl-row'+(playing?.id===d.id?' on':'')}><div><b>{d.kind==='movie'?first.mediaName:d.episodeName||t('Episode {n}',{n:d.episodeNo||''})}</b><small>{fmtBytes(d.size||0)}{d.subtitles?.length?' · '+plural(d.subtitles.length,'{n} subtitle','{n} subtitles'):''}</small></div><button className="primary" onClick={()=>setPlaying(d)}>{'▶ '+t('Play')}</button><button onClick={()=>{api().dlRemove(d.id).then(refreshDownloads);if(playing?.id===d.id)setPlaying(null)}}>{t('Delete')}</button></li>)}</ul></section>})}
 </div>
}
