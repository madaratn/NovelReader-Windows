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
 if(!candidates.length)throw new Error(t('This episode has no stream that can be downloaded.'))
 const r=await api().dlStart({kind,mediaId:mediaIdOf(media),mediaName:String(media.name||media.title||''),cover:mediaCover(media)||'',episodeUrl:url,episodeName:String(ep?.name||ep?.title||''),episodeNo:episodeNo(ep,index+1),mediaKey:playerKey(kind,media,ep,index),candidates})
 refreshDownloads();return r
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
 const list=useDownloads(),[playing,setPlaying]=useState<VideoDownload|null>(null),[usage,setUsage]=useState<{bytes:number,count:number}|null>(null),[confirmAll,setConfirmAll]=useState(false)
 useEffect(()=>{if(downloadsSupported())api().dlUsage().then(setUsage).catch(()=>{})},[list])
 if(!downloadsSupported())return <div className="media-search-page"><header><div><h1>{t('Downloads')}</h1></div></header><section className="panel"><p>{t('Downloads are available in the Windows app.')}</p></section></div>
 const active=list.filter(d=>d.state!=='done'),done=list.filter(d=>d.state==='done')
 const groups=new Map<string,VideoDownload[]>();for(const d of done){const k=d.kind+':'+d.mediaId;if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(d)}
 const kindLabel=(k:string)=>k==='movie'?t('MOVIE'):k==='series'?t('SERIES'):t('ANIME')
 return <div className="media-search-page downloads-page"><header><div><h1>{t('Downloads')}</h1><p>{t('Episodes and movies saved on this PC. They play without internet, with their subtitles.')}</p></div></header>
  <div className="downloads-bar"><span>{usage?plural(usage.count,'{n} video','{n} videos')+' · '+fmtBytes(usage.bytes):''}</span><div className="libraryactions"><button onClick={()=>api().dlOpenFolder()}>{t('Open folder')}</button>{done.length>0&&(confirmAll?<button className="danger" onClick={()=>{api().dlClear().then(refreshDownloads);setConfirmAll(false);setPlaying(null)}}>{t('Delete all downloads')}</button>:<button onClick={()=>setConfirmAll(true)}>{t('Free up space…')}</button>)}</div></div>
  {playing&&<section className="panel media-player-top"><div className="media-player-title"><div><span className="media-kicker">{t('OFFLINE')}</span><h2>{playing.mediaName}{playing.kind!=='movie'&&playing.episodeName?' · '+playing.episodeName:''}</h2></div><button onClick={()=>setPlaying(null)}>{t('Close')}</button></div><AnimeVideo key={playing.id} video={offlineVideo(playing)} mediaKey={playing.mediaKey}/></section>}
  {active.length>0&&<section className="panel"><h2>{t('In progress')}</h2><ul className="downloads-list">{active.map(d=><li key={d.id} className={'dl-row '+d.state}><div><b>{d.mediaName}</b><small>{d.kind==='movie'?kindLabel(d.kind):d.episodeName||t('Episode {n}',{n:d.episodeNo||''})}</small>{d.state==='error'?<NoticeText text={d.error||''}/>:<div className="libbar"><span style={{width:Math.round(d.progress*100)+'%'}}/></div>}</div><span className="dl-state">{d.state==='queued'?t('Waiting'):d.state==='error'?t('Failed'):Math.round(d.progress*100)+'%'+(d.bytes?' · '+fmtBytes(d.bytes):'')}</span><button onClick={()=>(d.state==='error'?api().dlRemove(d.id):api().dlCancel(d.id)).then(refreshDownloads)}>{d.state==='error'?t('Remove'):t('Cancel')}</button></li>)}</ul></section>}
  {done.length===0&&active.length===0&&<section className="panel lib-empty"><h2>{t('No downloads yet')}</h2><p>{t('Open an anime, a series or a movie and use the ⤓ button on an episode to keep it on this PC.')}</p></section>}
  {[...groups.values()].map(g=>{const first=g[0];return <section className="panel dl-group" key={first.kind+first.mediaId}><div className="dl-head"><Cover src={first.cover||''} name={first.mediaName}/><div><span className="media-kicker">{kindLabel(first.kind)}</span><h2>{first.mediaName}</h2><small>{plural(g.length,'{n} video','{n} videos')+' · '+fmtBytes(g.reduce((n,d)=>n+(d.size||0),0))}</small></div></div>
   <ul className="downloads-list">{g.sort((a,b)=>(a.episodeNo||0)-(b.episodeNo||0)).map(d=><li key={d.id} className={'dl-row'+(playing?.id===d.id?' on':'')}><div><b>{d.kind==='movie'?first.mediaName:d.episodeName||t('Episode {n}',{n:d.episodeNo||''})}</b><small>{fmtBytes(d.size||0)}{d.subtitles?.length?' · '+plural(d.subtitles.length,'{n} subtitle','{n} subtitles'):''}</small></div><button className="primary" onClick={()=>setPlaying(d)}>{'▶ '+t('Play')}</button><button onClick={()=>{api().dlRemove(d.id).then(refreshDownloads);if(playing?.id===d.id)setPlaying(null)}}>{t('Delete')}</button></li>)}</ul></section>})}
 </div>
}
