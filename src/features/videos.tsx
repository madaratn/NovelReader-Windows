import React,{useEffect,useRef,useState}from'react'
import{t,plural,getLang}from'../i18n'
import{clamp,fmtMB,fmtSize,fmtTime,isTyping,lsGet,lsSet}from'../lib/util'
import{NoticeText}from'../ui/common'

export function readPos(url:string):{t:number,d:number,done?:boolean,at?:number}|null{try{return JSON.parse(localStorage.getItem('localpos:'+url)||'null')}catch{return null}}
// Shared player helpers: keyboard shortcuts and remembered volume.
export function rememberVolume(el:HTMLVideoElement){lsSet('videoVolume',JSON.stringify({v:el.volume,m:el.muted}))}
export function restoreVolume(el:HTMLVideoElement){try{const x=JSON.parse(lsGet('videoVolume')||'null');if(x){el.volume=clamp(Number(x.v),0,1);el.muted=!!x.m}}catch{}}
export function useVideoShortcuts(ref:React.RefObject<HTMLVideoElement|null>,active:boolean,opts:{onNext?:()=>void,onPrev?:()=>void}={}){
 const optsRef=useRef(opts);optsRef.current=opts
 useEffect(()=>{if(!active)return
  const onKey=(e:KeyboardEvent)=>{const v=ref.current;if(!v||isTyping(e.target)||e.ctrlKey||e.metaKey||e.altKey)return
   if(e.target===v)return // the native controls already handle keys when the video has focus
   const k=e.key.length===1?e.key.toLowerCase():e.key
   if((k===' '&&(e.target as HTMLElement).tagName!=='BUTTON')||k==='k'){v.paused?v.play().catch(()=>{}):v.pause()}
   else if(k==='ArrowRight'||k==='l'){v.currentTime=Math.min(v.duration||Infinity,v.currentTime+10)}
   else if(k==='ArrowLeft'||k==='j'){v.currentTime=Math.max(0,v.currentTime-10)}
   else if(k==='f'){document.fullscreenElement?document.exitFullscreen().catch(()=>{}):v.requestFullscreen().catch(()=>{})}
   else if(k==='m'){v.muted=!v.muted}
   else if(k==='n'&&optsRef.current.onNext){optsRef.current.onNext()}
   else if(k==='p'&&optsRef.current.onPrev){optsRef.current.onPrev()}
   else return
   e.preventDefault()}
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[active])
}
export const playerKeys=()=>t('Space play/pause · ← → 10 s · F fullscreen · M mute')

// ---- Local Videos: subtitles and audio tracks ----------------------------------------
// Subtitles come from the main process (files next to the video, text tracks
// inside MKV files) as WebVTT; audio tracks from video.audioTracks (enabled
// with the AudioVideoTracks Blink feature). Choices are remembered per video,
// and the language picked last is preferred for the next videos.
const BIB:Record<string,string>={fre:'fr',ger:'de',chi:'zh',cze:'cs',dut:'nl',gre:'el',per:'fa',rum:'ro',slo:'sk',alb:'sq',arm:'hy',baq:'eu',bur:'my',geo:'ka',ice:'is',mac:'mk',mao:'mi',may:'ms',tib:'bo',wel:'cy'}
export const normLang=(code:string)=>{const c=(code||'').trim().toLowerCase();if(!c||c==='und'||c==='zxx'||c==='mul')return'';return BIB[c]||c}
export function langName(code:string){const c=normLang(code);if(!c)return'';try{const n=new Intl.DisplayNames([getLang()],{type:'language'}).of(c);if(n&&n.toLowerCase()!==c)return n.charAt(0).toUpperCase()+n.slice(1)}catch{}return c.toUpperCase()}
const joinLabel=(lang:string,label:string)=>(!label?lang:!lang||label.toLowerCase().includes(lang.toLowerCase())?label:lang+' — '+label)
export function subtitleLabel(s:LocalSubtitle,i:number){const parts=[joinLabel(langName(s.lang),s.label)].filter(Boolean);let out=parts.join(' — ')||t('Track {n}',{n:i+1});if(s.forced)out+=' ('+t('forced')+')';if(s.source==='file')out+=' · '+t('file');if(!s.supported)out+=' — '+t('pictures, cannot be shown');return out}
type AudioChoice={label:string,lang:string}
function pickSubtitle(list:LocalSubtitle[],url:string){const ok=list.filter(s=>s.supported);const saved=lsGet('localsub:'+url);if(saved==='off')return null;if(saved&&ok.some(s=>s.id===saved))return saved
 const pref=lsGet('subLang')||'';if(pref==='off')return null
 if(pref){const m=ok.filter(s=>normLang(s.lang)===pref);const full=m.find(s=>!s.forced)||m[0];if(full)return full.id}
 return(ok.find(s=>s.source==='file')||ok.find(s=>s.default&&s.source==='embedded'&&!pref)||null)?.id||null}
export function useLocalTracks(ref:React.RefObject<HTMLVideoElement|null>,current:LocalVideo|null,onError:(msg:string)=>void){
 const[subs,setSubs]=useState<LocalSubtitle[]>([]),[subId,setSubId]=useState(''),[subSrc,setSubSrc]=useState(''),[subBusy,setSubBusy]=useState(false),[audio,setAudio]=useState<AudioChoice[]>([]),[audioIdx,setAudioIdx]=useState(0)
 const token=useRef(0),api=(window as any).novelReader
 const load=async(id:string,remember:boolean)=>{const my=++token.current;if(!current)return
  if(remember){lsSet('localsub:'+current.url,id||'off');const s=subs.find(x=>x.id===id);lsSet('subLang',id?(normLang(s?.lang||'')||lsGet('subLang')||''):'off')}
  if(!id){setSubId('');setSubSrc('');setSubBusy(false);return}
  setSubBusy(true)
  try{const vtt:string=await api.localSubtitle(current.url,id);if(my!==token.current)return;setSubSrc(URL.createObjectURL(new Blob([vtt],{type:'text/vtt'})));setSubId(id)}
  catch(e:any){if(my===token.current){setSubId('');setSubSrc('');onError(String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/,''))}}
  finally{if(my===token.current)setSubBusy(false)}}
 useEffect(()=>{token.current++;setSubs([]);setSubId('');setSubSrc('');setSubBusy(false);setAudio([]);setAudioIdx(0)
  if(!current||!api?.localTracks)return
  let alive=true
  api.localTracks(current.url).then((r:{subtitles:LocalSubtitle[]})=>{if(!alive)return;setSubs(r.subtitles||[]);const pick=pickSubtitle(r.subtitles||[],current.url);if(pick)loadRef.current(pick,false)}).catch(()=>{})
  return()=>{alive=false}},[current?.url])
 const loadRef=useRef(load);loadRef.current=load
 useEffect(()=>()=>{if(subSrc)URL.revokeObjectURL(subSrc)},[subSrc])
 // Show the (single) subtitle track once it is attached.
 useEffect(()=>{const v=ref.current;if(!v)return;const tracks=[...v.textTracks];tracks.forEach((tr,i)=>{tr.mode=subSrc&&i===tracks.length-1?'showing':'disabled'})},[subSrc])
 const onMetadata=(el:HTMLVideoElement)=>{const at=(el as any).audioTracks;if(!at||at.length<2){setAudio([]);return}
  const list:AudioChoice[]=[...at].map((x:any,i:number)=>({label:x.label||'',lang:x.language||'',i}))
  setAudio(list)
  const pref=lsGet('audioLang')||'';let idx=[...at].findIndex((x:any)=>x.enabled);if(idx<0)idx=0
  if(pref){const m=list.findIndex(a=>normLang(a.lang)===pref||(!a.lang&&a.label===pref));if(m>=0&&m!==idx){selectAudioOn(el,m);idx=m}}
  setAudioIdx(idx)}
 const selectAudioOn=(el:HTMLVideoElement,i:number)=>{const at=(el as any).audioTracks;if(!at||!at[i])return;at[i].enabled=true;for(let k=0;k<at.length;k++)if(k!==i)at[k].enabled=false}
 const chooseAudio=(i:number)=>{const el=ref.current;if(!el)return;selectAudioOn(el,i);setAudioIdx(i);const a=audio[i];if(a)lsSet('audioLang',normLang(a.lang)||a.label)}
 const audioLabel=(a:AudioChoice,i:number)=>joinLabel(langName(a.lang),a.label)||t('Track {n}',{n:i+1})
 const cycleSub=()=>{const ok=subs.filter(s=>s.supported);if(!ok.length)return;const i=ok.findIndex(s=>s.id===subId);load(i+1<ok.length?ok[i+1].id:'',true)}
 const cycleAudio=()=>{if(audio.length>1)chooseAudio((audioIdx+1)%audio.length)}
 const sub=subs.find(s=>s.id===subId)
 const track=subSrc?<track key={subSrc} kind="subtitles" src={subSrc} srcLang={normLang(sub?.lang||'')||undefined} label={sub?subtitleLabel(sub,subs.indexOf(sub)):''} default/>:null
 return{subs,subId,subBusy,audio,audioIdx,track,onMetadata,chooseSub:(id:string)=>load(id,true),chooseAudio,audioLabel,cycleSub,cycleAudio}
}
export function TrackControls({tr}:{tr:ReturnType<typeof useLocalTracks>}){
 return <div className="track-row">
  {tr.subs.length>0?<label className="lib-sort">{t('Subtitles')}<select value={tr.subId} onChange={e=>tr.chooseSub(e.target.value)} aria-label={t('Subtitles')}>
   <option value="">{t('Off')}</option>{tr.subs.map((s,i)=><option key={s.id} value={s.id} disabled={!s.supported}>{subtitleLabel(s,i)}</option>)}</select>{tr.subBusy&&<span className="spinner" aria-label={t('Loading subtitles…')}/>}</label>
  :<small className="player-hint">{t('No subtitles found. To add some, put a .srt file with the same name next to the video.')}</small>}
  {tr.audio.length>1&&<label className="lib-sort">{t('Audio')}<select value={tr.audioIdx} onChange={e=>tr.chooseAudio(Number(e.target.value))} aria-label={t('Audio')}>{tr.audio.map((a,i)=><option key={i} value={i}>{tr.audioLabel(a,i)}</option>)}</select></label>}
 </div>
}
export function LocalVideos(){
 const[folders,setFolders]=useState<string[]>([]),[videos,setVideos]=useState<LocalVideo[]>([]),[filter,setFilter]=useState(''),[sort,setSort]=useState<'name'|'added'>(()=>lsGet('localSort')==='added'?'added':'name'),[current,setCurrent]=useState<LocalVideo|null>(null),[loading,setLoading]=useState(true),[playError,setPlayError]=useState(''),[,tick]=useState(0)
 const ref=useRef<HTMLVideoElement>(null),lastSave=useRef(0)
 const refresh=async()=>{setLoading(true);try{setFolders(await window.novelReader.localFolders());setVideos(await window.novelReader.localListVideos())}finally{setLoading(false)}}
 useEffect(()=>{refresh()},[])
 const q=filter.trim().toLowerCase()
 const shown=videos.filter(v=>!q||(v.relPath+' '+v.folder).toLowerCase().includes(q)).sort((a,b)=>sort==='added'?b.mtime-a.mtime:0)
 const play=(v:LocalVideo)=>{setPlayError('');setCurrent(v);window.scrollTo({top:0,behavior:'smooth'})}
 const neighbour=(d:number)=>{if(!current)return null;const i=shown.findIndex(v=>v.url===current.url);return shown[i+d]||null}
 const step=(d:number)=>{const n=neighbour(d);if(n)play(n)}
 const save=(el:HTMLVideoElement,done=false)=>{if(!current||!el.duration)return;localStorage.setItem('localpos:'+current.url,JSON.stringify({t:done?0:el.currentTime,d:el.duration,done:done||el.currentTime>el.duration-30,at:Date.now()}))}
 useVideoShortcuts(ref,!!current,{onNext:()=>step(1),onPrev:()=>step(-1)})
 const tracks=useLocalTracks(ref,current,msg=>setPlayError(t(msg))),tracksRef=useRef(tracks);tracksRef.current=tracks
 // C: next subtitles (or off), A: next audio track.
 useEffect(()=>{if(!current)return;const onKey=(e:KeyboardEvent)=>{if(isTyping(e.target)||e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();if(k==='c'){tracksRef.current.cycleSub();e.preventDefault()}else if(k==='a'){tracksRef.current.cycleAudio();e.preventDefault()}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[!!current])
 // "Continue watching": started but unfinished, most recent first.
 const inProgress=videos.map(v=>({v,p:readPos(v.url)})).filter(x=>x.p&&!x.p.done&&x.p.t>5).sort((a,b)=>(b.p!.at||0)-(a.p!.at||0)).slice(0,6)
 // Group by sub-folder (one group per season/series folder) when sorted by name.
 const groups:[string,LocalVideo[]][]=[];if(sort==='name'){const map=new Map<string,LocalVideo[]>();for(const v of shown){const dir=v.relPath.includes('/')||v.relPath.includes('\\')?v.relPath.replace(/[\\/][^\\/]*$/,''):'';const key=(folders.length>1?v.folder.split(/[\\/]/).pop()+(dir?' / ':''):'')+dir;if(!map.has(key))map.set(key,[]);map.get(key)!.push(v)}groups.push(...map.entries())}else groups.push(['',shown])
 const card=(v:LocalVideo)=>{const p=readPos(v.url);const pct=p&&p.d?Math.min(100,(p.done?1:p.t/p.d)*100):0;const name=v.relPath.split(/[\\/]/).pop()||v.name;return <button key={v.url} className={'localcard'+(current?.url===v.url?' active':'')+(p?.done?' watched':'')} onClick={()=>play(v)} title={v.relPath}>
  <span className="localname">{p?.done&&<span className="watched-mark" aria-label={t('Watched')}>✓ </span>}{name}</span>
  <small>{fmtSize(v.size)}{p?.done?' · '+t('watched'):p&&p.t>5?' · '+t('resume at {time}',{time:fmtTime(p.t)}):''}</small>
  <span className="localbar"><span style={{width:pct+'%'}}/></span></button>}
 const next=neighbour(1)
 return <>
  <header><div><h1>{t('Local Videos')}</h1><p>{t('Play video files stored on this PC. {files} in {folders}.',{files:plural(videos.length,'{n} file','{n} files'),folders:plural(folders.length,'{n} folder','{n} folders')})}</p></div></header>
  {current&&<section className="panel local-player"><h2>{current.name}</h2>
   <video ref={ref} key={current.url} src={current.url} controls autoPlay
    onLoadedMetadata={e=>{const el=e.currentTarget;restoreVolume(el);tracks.onMetadata(el);const p=readPos(current.url);if(p&&!p.done&&p.t>5&&p.t<el.duration-10)el.currentTime=p.t}}
    onVolumeChange={e=>rememberVolume(e.currentTarget)}
    onTimeUpdate={e=>{const now=Date.now();if(now-lastSave.current>4000){lastSave.current=now;save(e.currentTarget)}}}
    onPause={e=>{save(e.currentTarget);tick(x=>x+1)}}
    onEnded={e=>{save(e.currentTarget,true);tick(x=>x+1);step(1)}}
    onError={e=>{const c=e.currentTarget.error?.code;setPlayError(c===4?t('This file uses a format or codec the built-in player cannot decode (common with HEVC/H.265 video or AC3/DTS audio in MKV files). An MP4 with H.264 video and AAC audio will play.'):t('The file could not be read. It may have been moved, renamed or deleted — try Rescan.'))}}>{tracks.track}</video>
   {playError&&<div className="anime-toast error"><NoticeText text={playError}/><button onClick={()=>setPlayError('')}>×</button></div>}
   <TrackControls tr={tracks}/>
   <div className="player-row"><div className="libraryactions"><button disabled={!neighbour(-1)} onClick={()=>step(-1)} title={t('Previous')+' (P)'}>← {t('Previous')}</button><button disabled={!next} onClick={()=>step(1)} title={t('Next')+' (N)'}>{t('Next')} →</button><button onClick={()=>{if(ref.current)ref.current.pause();setCurrent(null)}}>{t('Close player')}</button></div>
    <small className="player-hint">{next?<>{t('Up next:')} <b>{next.relPath.split(/[\\/]/).pop()}</b> · </>:null}{playerKeys()} · {t('N/P next/previous')}{tracks.subs.some(x=>x.supported)?' · '+t('C subtitles'):''}{tracks.audio.length>1?' · '+t('A audio'):''}</small></div>
  </section>}
  {folders.length===0&&!loading?<section className="panel lib-empty"><h2>{t('Add your video folders')}</h2><p>{t('Pick a folder on this PC that contains videos (MP4, WebM, MKV…). Sub-folders are scanned too, and each one becomes its own group.')}</p><button className="primary" onClick={async()=>{await window.novelReader.localAddFolder();refresh()}}>{t('Add folder…')}</button></section>:<>
   {inProgress.length>0&&!q&&<section className="panel"><h2>{t('Continue watching')}</h2><div className="localgrid compact">{inProgress.map(x=>card(x.v))}</div></section>}
   {videos.length>0&&<section className="panel"><div className="lib-toolbar"><div className="searchbar"><input placeholder={t('Filter videos…')} value={filter} onChange={e=>setFilter(e.target.value)} aria-label={t('Filter videos…')}/></div>
     <label className="lib-sort">{t('Sort')}<select value={sort} onChange={e=>{const v=e.target.value==='added'?'added':'name';setSort(v);lsSet('localSort',v)}}><option value="name">{t('By folder and name')}</option><option value="added">{t('Recently added')}</option></select></label></div>
    {shown.length===0?<p>{t('No video matches “{q}”.',{q:filter})}</p>:groups.map(([g,list])=><div className="localgroup" key={g||'_'}>{g&&<h3>{g} <small>{list.length}</small></h3>}<div className="localgrid">{list.map(card)}</div></div>)}
   </section>}
   <details className="panel folders-panel" open={videos.length===0}><summary><h2>{t('Folders')}</h2><small>{plural(folders.length,'{n} folder','{n} folders')}</small></summary>
    <div className="scanlist">{folders.map(f=><div className="scanrow" key={f}><span>{f}</span><small>{plural(videos.filter(v=>v.folder===f).length,'{n} video','{n} videos')}</small><button onClick={async()=>{setFolders(await window.novelReader.localRemoveFolder(f));setVideos(v=>v.filter(x=>x.folder!==f));if(current?.folder===f)setCurrent(null)}}>{t('Remove')}</button></div>)}</div>
    <div className="libraryactions"><button className="primary" onClick={async()=>{await window.novelReader.localAddFolder();refresh()}}>{t('Add folder…')}</button><button disabled={loading} onClick={refresh}>{loading?t('Scanning…'):t('Rescan')}</button></div>
   </details>
  </>}
 </>
}
export function torrentLabel(st:TorrentStatus|null,starting:boolean){
 if(starting&&!st)return t('Fetching the torrent from archive.org…')
 if(!st)return ''
 const pct=st.progress!=null?Math.floor(st.progress*100)+'%':''
 switch(st.state){
  case 'fetching':return t('Fetching the torrent from archive.org…')
  case 'metadata':return t('Loading torrent metadata…')
  case 'connecting':return t('Connecting to peers…')
  case 'buffering':return t('Buffering…')+' '+fmtMB(st.downloaded||0)+' · '+plural(st.numPeers||0,'{n} peer','{n} peers')
  case 'downloading':return t('Downloading')+' · '+fmtMB(st.downloadSpeed||0)+'/s · '+plural(st.numPeers||0,'{n} peer','{n} peers')+' · '+pct
  case 'done':return t('Fully downloaded')+' · '+fmtMB(st.size||0)
  case 'stalled':return t('Stalled — no data received for 45 s. The peers or the archive.org web seed may be unreachable.')
  case 'error':return st.error||t('The torrent failed.')
  default:return ''}}
export function ArchivePage(){
 const[query,setQuery]=useState(''),[results,setResults]=useState<ArchiveItem[]>([]),[searching,setSearching]=useState(false),[item,setItem]=useState<ArchiveDetails|null>(null),[itemLoading,setItemLoading]=useState(false),[error,setError]=useState('')
 const[playing,setPlaying]=useState<{info:TorrentInfo,title:string}|null>(null),[starting,setStarting]=useState(''),[status,setStatus]=useState<TorrentStatus|null>(null),[playError,setPlayError]=useState('')
 const sessionRef=useRef<string|null>(null),startToken=useRef(0)
 const archiveVideoRef=useRef<HTMLVideoElement>(null)
 useVideoShortcuts(archiveVideoRef,!!playing)
 const stopCurrent=async()=>{const id=sessionRef.current;sessionRef.current=null;if(id){try{await window.novelReader.torrentStop(id)}catch{}}}
 useEffect(()=>()=>{stopCurrent()},[])
 useEffect(()=>{if(!playing)return;let alive=true;const tick=async()=>{try{const st=await window.novelReader.torrentStatus(playing.info.sessionId);if(alive)setStatus(st)}catch{}};tick();const t=setInterval(tick,1000);return()=>{alive=false;clearInterval(t)}},[playing?.info.sessionId])
 const doSearch=async()=>{const q=query.trim();if(!q)return;setSearching(true);setError('');setItem(null);try{setResults(await window.novelReader.archiveSearch(q))}catch(e:any){setError(t('Search failed:')+' '+(e.message||String(e)))}finally{setSearching(false)}}
 const openItem=async(r:ArchiveItem)=>{setItemLoading(true);setError('');try{setItem(await window.novelReader.archiveFiles(r.identifier))}catch(e:any){setError(t('Could not open this item:')+' '+(e.message||String(e)))}finally{setItemLoading(false)}}
 const play=async(file:{name:string})=>{if(!item)return;const token=++startToken.current;setPlayError('');setStatus(null);setPlaying(null);setStarting(file.name);await stopCurrent()
  try{const info=await window.novelReader.torrentStart(item.identifier,file.name);if(token!==startToken.current){window.novelReader.torrentStop(info.sessionId).catch(()=>{});return}sessionRef.current=info.sessionId;setPlaying({info,title:item.title});window.scrollTo({top:0,behavior:'smooth'})}
  catch(e:any){if(token===startToken.current)setPlayError(t('Could not start the torrent:')+' '+(e.message||String(e)))}finally{if(token===startToken.current)setStarting('')}}
 const close=async()=>{startToken.current++;setPlaying(null);setStatus(null);setStarting('');await stopCurrent()}
 const label=torrentLabel(status,!!starting)
 return <>
  <header><div><h1>Internet Archive</h1><p>{t('Public-domain and Creative Commons films and cartoons, streamed from archive.org\'s official torrents.')}</p></div></header>
  {(playing||starting)&&<section className="panel local-player"><h2>{playing?playing.title+' — '+playing.info.fileName:starting}</h2>
   {playing&&<video ref={archiveVideoRef} key={playing.info.streamUrl} src={playing.info.streamUrl} controls autoPlay onLoadedMetadata={e=>restoreVolume(e.currentTarget)} onVolumeChange={e=>rememberVolume(e.currentTarget)} onError={e=>{const c=e.currentTarget.error?.code;setPlayError(c===4?t('This file uses a format or codec the built-in player cannot decode. Try the MP4 version of the item.'):t('Playback failed while reading the torrent stream.'))}}/>}
   <p className={'torrent-status state-'+(status?.state||'starting')}>{label}{status&&status.progress!=null&&status.state!=='done'&&<span className="localbar"><span style={{width:Math.floor((status.progress||0)*100)+'%'}}/></span>}</p>
   {playError&&<div className="anime-toast error"><NoticeText text={playError}/><button onClick={()=>setPlayError('')}>×</button></div>}
   <div className="player-row"><div className="libraryactions"><button onClick={close}>{t('Stop and close')}</button></div><small className="player-hint">{playerKeys()}</small></div>
  </section>}
  {!playing&&!starting&&playError&&<div className="anime-toast error"><NoticeText text={playError}/><button onClick={()=>setPlayError('')}>×</button></div>}
  <div className="searchbar"><input placeholder={t('Search, e.g. Popeye, Superman, Night of the Living Dead…')} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doSearch()}/><button className="primary" disabled={searching} onClick={doSearch}>{searching?t('Searching…'):t('Search')}</button></div>
  {error&&<div className="anime-toast error"><NoticeText text={error}/><button onClick={()=>setError('')}>×</button></div>}
  {item&&<section className="panel"><h2>{item.title}</h2>
   {!item.hasTorrent?<p>{t('This item has no torrent on archive.org.')}</p>:item.files.length===0?<p>{t('No video files in this item.')}</p>:<div className="scanlist">{item.files.map(f=><div className="scanrow" key={f.name}><span>{f.name}</span><small>{f.format}{f.size?' · '+fmtMB(f.size):''}</small><button className="primary" disabled={!!starting} onClick={()=>play(f)}>{starting===f.name?t('Starting…'):t('Play')}</button></div>)}</div>}
   <div className="libraryactions"><button onClick={()=>setItem(null)}>← {t('Back to results')}</button></div>
  </section>}
  {!item&&results.length>0&&<section className="panel"><h2>{plural(results.length,'{n} result','{n} results')}</h2><div className="scanlist">{results.map(r=><div className="scanrow clickable" key={r.identifier} onClick={()=>!itemLoading&&openItem(r)}><span><b>{r.title}</b>{r.year?' · '+r.year:''}</span><small>{t('{n} downloads',{n:r.downloads.toLocaleString(getLang())})}</small><b className="status reachable">{itemLoading?'…':t('open')}</b></div>)}</div></section>}
  {!item&&!searching&&results.length===0&&query.trim()===''&&<section className="panel"><h2>{t('Getting started')}</h2><p>{t('Search for a title. Results are limited to archive.org\'s public-domain collections (classic cartoons, feature films, Prelinger, silent films) and items with a Creative Commons or public-domain license. MP4 files play best.')}</p></section>}
 </>
}
