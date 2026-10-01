import React,{useEffect,useRef,useState}from'react'
import{createRoot}from'react-dom/client'
import Hls from'hls.js'
import'./style.css'
import{t,plural,getLang,setLang,LANGS,type Lang}from'./i18n'
type Plugin={id:string,name:string,site:string,lang:string,version:string,url:string,iconUrl:string}
const MANIFEST='https://raw.githubusercontent.com/LNReader/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json'
function AnimeVideo({video}:{video:any}){const ref=useRef<HTMLVideoElement>(null);useEffect(()=>{const el=ref.current;if(!el||!video?.streamUrl)return;const url=String(video.streamUrl);const raw=String(video.videoUrl||video.url||video.link||'').toLowerCase();let hls:Hls|null=null;if(raw.includes('.m3u8')&&Hls.isSupported()){hls=new Hls({maxBufferLength:60});hls.loadSource(url);hls.attachMedia(el);hls.on(Hls.Events.MANIFEST_PARSED,()=>el.play().catch(()=>{}));hls.on(Hls.Events.ERROR,(_evt,data)=>{if(!data.fatal)return;if(data.type===Hls.ErrorTypes.NETWORK_ERROR)hls?.startLoad();else if(data.type===Hls.ErrorTypes.MEDIA_ERROR)hls?.recoverMediaError();else hls?.destroy()})}else{el.src=url;el.play().catch(()=>{})}return()=>{hls?.destroy();el.removeAttribute('src');el.load()}},[video?.streamUrl]);return <video ref={ref} controls autoPlay style={{width:'100%',maxHeight:'70vh',background:'#000'}}/>}
// ---- Readable error messages -------------------------------------------
// Engine errors can carry hundreds of lines of Java stack trace. Show one
// readable sentence; keep the raw text in a collapsible panel for debugging.
function splitError(raw:string){let t=String(raw||'').replace(/Error invoking remote method '[^']+':\s*(Error:\s*)?/g,'').trim();const cut=t.search(/\s(Engine:|Caused by|\d{4}-\d\d-\d\dT\d\d:\d\d|at [a-z][\w$]*\.[\w$.]+\()|\s—\s|\s\|\s|\n/);let summary=(cut>0?t.slice(0,cut):t).trim();if(summary.length>240)summary=summary.slice(0,237)+'…';return{summary,details:summary===t?'':t}}
function NoticeText({text}:{text:string}){const{summary,details}=splitError(text);const[copied,setCopied]=useState(false);return <div className="notice-text"><span>{summary}</span>{details&&<details className="notice-details"><summary>{t('Technical details')}</summary><pre>{details.replace(/\s\|\s/g,'\n')}</pre><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(details);setCopied(true);setTimeout(()=>setCopied(false),1500)}catch{}}}>{copied?t('Copied'):t('Copy details')}</button></details>}</div>}

// ---- Local videos -------------------------------------------------------
const fmtSize=(n:number)=>n>1e9?(n/1e9).toFixed(1)+' GB':(n/1e6).toFixed(0)+' MB'
const fmtTime=(t:number)=>{t=Math.floor(t);const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return(h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(s).padStart(2,'0')}
function readPos(url:string):{t:number,d:number,done?:boolean,at?:number}|null{try{return JSON.parse(localStorage.getItem('localpos:'+url)||'null')}catch{return null}}
// Shared player helpers: keyboard shortcuts and remembered volume.
function rememberVolume(el:HTMLVideoElement){lsSet('videoVolume',JSON.stringify({v:el.volume,m:el.muted}))}
function restoreVolume(el:HTMLVideoElement){try{const x=JSON.parse(lsGet('videoVolume')||'null');if(x){el.volume=clamp(Number(x.v),0,1);el.muted=!!x.m}}catch{}}
function useVideoShortcuts(ref:React.RefObject<HTMLVideoElement|null>,active:boolean,opts:{onNext?:()=>void,onPrev?:()=>void}={}){
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
const playerKeys=()=>t('Space play/pause · ← → 10 s · F fullscreen · M mute')
function LocalVideos(){
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
    onLoadedMetadata={e=>{const el=e.currentTarget;restoreVolume(el);const p=readPos(current.url);if(p&&!p.done&&p.t>5&&p.t<el.duration-10)el.currentTime=p.t}}
    onVolumeChange={e=>rememberVolume(e.currentTarget)}
    onTimeUpdate={e=>{const now=Date.now();if(now-lastSave.current>4000){lastSave.current=now;save(e.currentTarget)}}}
    onPause={e=>{save(e.currentTarget);tick(x=>x+1)}}
    onEnded={e=>{save(e.currentTarget,true);tick(x=>x+1);step(1)}}
    onError={e=>{const c=e.currentTarget.error?.code;setPlayError(c===4?t('This file uses a format or codec the built-in player cannot decode (common with HEVC/H.265 video or AC3/DTS audio in MKV files). An MP4 with H.264 video and AAC audio will play.'):t('The file could not be read. It may have been moved, renamed or deleted — try Rescan.'))}}/>
   {playError&&<div className="anime-toast error"><NoticeText text={playError}/><button onClick={()=>setPlayError('')}>×</button></div>}
   <div className="player-row"><div className="libraryactions"><button disabled={!neighbour(-1)} onClick={()=>step(-1)} title={t('Previous')+' (P)'}>← {t('Previous')}</button><button disabled={!next} onClick={()=>step(1)} title={t('Next')+' (N)'}>{t('Next')} →</button><button onClick={()=>{if(ref.current)ref.current.pause();setCurrent(null)}}>{t('Close player')}</button></div>
    <small className="player-hint">{next?<>{t('Up next:')} <b>{next.relPath.split(/[\\/]/).pop()}</b> · </>:null}{playerKeys()} · {t('N/P next/previous')}</small></div>
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

// ---- Internet Archive (torrent streaming) -------------------------------
// Public-domain / Creative Commons videos from archive.org, streamed from the
// item's official torrent by the Electron main process.
const fmtMB=(n:number)=>(n/1048576).toFixed(n<10485760?1:0)+' MB'
function torrentLabel(st:TorrentStatus|null,starting:boolean){
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
function ArchivePage(){
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

// ---- App shell: navigation model, sidebar, shortcuts ---------------------
type Mode='books'|'anime'|'series'|'movies'
type NavItem={page:string,label:string,icon:string}
const NAV:Record<Mode,{label:string,icon:string,items:NavItem[]}>={
 books:{label:'Books',icon:'book',items:[{page:'library',label:'Library',icon:'grid'},{page:'search',label:'Global Search',icon:'search'},{page:'sources',label:'Sources',icon:'plug'}]},
 anime:{label:'Anime',icon:'play',items:[{page:'anime',label:'Anime Library',icon:'grid'},{page:'animeSearch',label:'Global Search',icon:'search'},{page:'animeSources',label:'Sources',icon:'plug'},{page:'localVideos',label:'Local Videos',icon:'folder'},{page:'archive',label:'Internet Archive',icon:'archive'}]},
 series:{label:'Series',icon:'tv',items:[{page:'series',label:'Series Library',icon:'grid'},{page:'seriesSearch',label:'Global Search',icon:'search'}]},
 movies:{label:'Movies',icon:'film',items:[{page:'movies',label:'Movie Library',icon:'grid'},{page:'movieSearch',label:'Global Search',icon:'search'}]}
}
const MODES=Object.keys(NAV) as Mode[]
// Detail pages highlight their parent entry in the sidebar.
const PARENT:Record<string,string>={novel:'library',reader:'library',animeDetail:'anime',seriesDetail:'series'}
const DETAIL_TITLES:Record<string,string>={novel:'Novel',reader:'Reader',animeDetail:'Episodes',seriesDetail:'Episodes',settings:'Settings'}
const isMode=(m:any):m is Mode=>MODES.includes(m)
const isTopPage=(mode:Mode,page:string)=>NAV[mode].items.some(i=>i.page===page)
const lsGet=(k:string)=>{try{return localStorage.getItem(k)}catch{return null}}
const lsSet=(k:string,v:string)=>{try{localStorage.setItem(k,v)}catch{}}
try{if(localStorage.getItem('lastPage:books')==='comics')localStorage.setItem('lastPage:books','search')}catch{}
function startPage(mode:Mode){const last=lsGet('lastPage:'+mode)||'';return isTopPage(mode,last)?last:NAV[mode].items[0].page}
function pageLabel(mode:Mode,page:string){const own=NAV[mode].items.find(i=>i.page===page);if(own)return t(own.label);for(const m of MODES){const i=NAV[m].items.find(x=>x.page===page);if(i)return t(i.label)}return DETAIL_TITLES[page]?t(DETAIL_TITLES[page]):'NovelReader'}
const ICONS:Record<string,string>={
 book:'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zm0 15A1.5 1.5 0 0 0 6.5 21H19',
 play:'M4 5h16v14H4zM10 9l5 3-5 3z',
 tv:'M3 7h18v12H3zM8 3l4 4 4-4',
 film:'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
 grid:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
 comics:'M4 4h16v16H4zM4 12h16M12 4v8',
 search:'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8',
 plug:'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4',
 folder:'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
 archive:'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
 collapse:'M15 6l-6 6 6 6',
 expand:'M9 6l6 6-6 6',
 keys:'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
 gear:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'
}
function Icon({name}:{name:string}){return <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]||''}/></svg>}
const isTyping=(t:EventTarget|null)=>{const el=t as HTMLElement|null;return !!el&&(el.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(el.tagName))}
function focusPageSearch(){const el=document.querySelector<HTMLInputElement>('main .searchbar input, main input[type=search]');if(el){el.focus();el.select()}return !!el}
const SHORTCUTS:[string,string][]=[['Ctrl+1 … 4','Switch mode (Books, Anime, Series, Movies)'],['Ctrl+K  /  /','Jump to the search field of the page'],['Alt+←','Go back to the previous page (mouse back button too)'],['Ctrl+B','Collapse or expand the sidebar'],['?','Show or hide this list'],['Esc','Close this list / leave a text field']]
function ShortcutsDialog({onClose}:{onClose:()=>void}){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{ref.current?.focus()},[]);return <div className="kbd-overlay" onClick={onClose}><div className="kbd-dialog" role="dialog" aria-modal="true" aria-labelledby="kbd-title" tabIndex={-1} ref={ref} onClick={e=>e.stopPropagation()}><h2 id="kbd-title">{t('Keyboard shortcuts')}</h2><dl>{SHORTCUTS.map(([k,v])=><React.Fragment key={k}><dt><kbd>{k}</kbd></dt><dd>{t(v)}</dd></React.Fragment>)}</dl><button className="primary" onClick={onClose}>{t('Close')}</button></div></div>}
function Sidebar({mode,page,collapsed,onMode,onPage,onToggle,onHelp}:{mode:Mode,page:string,collapsed:boolean,onMode:(m:Mode)=>void,onPage:(p:string)=>void,onToggle:()=>void,onHelp:()=>void}){
 const current=isTopPage(mode,page)?page:PARENT[page]
 return <aside className="sidebar" aria-label={t('Main navigation')}>
  <div className="brand-row"><div className="brand" aria-label="NovelReader"><span className="brand-full">NOVEL<span>READER</span></span><span className="brand-short">N<span>R</span></span></div><button className="iconbtn collapse-btn" onClick={onToggle} title={t(collapsed?'Expand sidebar':'Collapse sidebar')+' (Ctrl+B)'} aria-label={t(collapsed?'Expand sidebar':'Collapse sidebar')} aria-expanded={!collapsed}><Icon name={collapsed?'expand':'collapse'}/></button></div>
  <div className="mode-switch" role="tablist" aria-label={t('Mode')}>{MODES.map((m,i)=><button key={m} role="tab" aria-selected={mode===m} className={mode===m?'active':''} onClick={()=>onMode(m)} title={t(NAV[m].label)+' (Ctrl+'+(i+1)+')'}><Icon name={NAV[m].icon}/><span className="label">{t(NAV[m].label)}</span></button>)}</div>
  <nav className="nav-list">{NAV[mode].items.map(it=><button key={it.page} className={'nav-item'+(current===it.page?' active':'')} aria-current={current===it.page?'page':undefined} onClick={()=>onPage(it.page)} title={collapsed?t(it.label):undefined}><Icon name={it.icon}/><span className="label">{t(it.label)}</span></button>)}</nav>
  <div className="grow"/>
  <button className={'nav-item subtle'+(page==='settings'?' active':'')} aria-current={page==='settings'?'page':undefined} onClick={()=>onPage('settings')} title={t('Settings')}><Icon name="gear"/><span className="label">{t('Settings')}</span></button>
  <button className="nav-item subtle" onClick={onHelp} title={t('Keyboard shortcuts')+' (?)'}><Icon name="keys"/><span className="label">{t('Shortcuts')}</span></button>
  <div className="version">{collapsed?'v0.2':'Windows · v0.2 alpha'}</div>
 </aside>
}

// ---- Novel reader preferences ---------------------------------------------
type ReaderTheme='dark'|'sepia'|'light'|'black'
type ReaderPrefs={theme:ReaderTheme,size:number,leading:number,width:'narrow'|'medium'|'wide'|'full',font:'serif'|'sans'}
const READER_DEFAULTS:ReaderPrefs={theme:'dark',size:20,leading:1.85,width:'full',font:'serif'}
const READER_WIDTHS={narrow:'640px',medium:'760px',wide:'920px',full:'none'}
const READER_FONTS={serif:"Georgia,'Iowan Old Style','Palatino Linotype',serif",sans:"'Segoe UI',Inter,system-ui,sans-serif"}
const READER_THEMES:{id:ReaderTheme,label:string}[]=[{id:'dark',label:'Dark'},{id:'sepia',label:'Sepia'},{id:'light',label:'Light'},{id:'black',label:'Black'}]
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v))
function loadReaderPrefs():ReaderPrefs{let saved:any={};try{saved=JSON.parse(localStorage.getItem('readerPrefs')||'{}')||{}}catch{}const legacy=lsGet('readerTheme');const p={...READER_DEFAULTS,...(legacy==='light'?{theme:'light'}:{}),...saved};return{theme:READER_THEMES.some(t=>t.id===p.theme)?p.theme:'dark',size:clamp(Number(p.size)||20,14,32),leading:clamp(Number(p.leading)||1.85,1.3,2.4),width:p.width in READER_WIDTHS?p.width:'full',font:p.font==='sans'?'sans':'serif'}}
function ReaderSettings({prefs,onChange,onClose}:{prefs:ReaderPrefs,onChange:(p:Partial<ReaderPrefs>)=>void,onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null)
 useEffect(()=>{ref.current?.querySelector<HTMLElement>('button')?.focus();const away=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node)&&!(e.target as HTMLElement).closest?.('.readersettings-btn'))onClose()};document.addEventListener('mousedown',away);return()=>document.removeEventListener('mousedown',away)},[])
 const seg=(key:'width'|'font',opts:[string,string][])=><div className="rs-seg" role="radiogroup">{opts.map(([v,l])=><button key={v} role="radio" aria-checked={prefs[key]===v} className={prefs[key]===v?'on':''} onClick={()=>onChange({[key]:v} as any)}>{l}</button>)}</div>
 return <div className="readersettings" ref={ref} role="dialog" aria-label={t('Reading settings')}>
  <div className="rs-row"><span>{t('Theme')}</span><div className="rs-themes">{READER_THEMES.map(th=><button key={th.id} className={'rs-swatch sw-'+th.id+(prefs.theme===th.id?' on':'')} aria-pressed={prefs.theme===th.id} onClick={()=>onChange({theme:th.id})}>{t(th.label)}</button>)}</div></div>
  <div className="rs-row"><span>{t('Text size')}</span><div className="rs-step"><button aria-label={t('Smaller text')} onClick={()=>onChange({size:clamp(prefs.size-1,14,32)})}>A−</button><output>{prefs.size}px</output><button aria-label={t('Larger text')} onClick={()=>onChange({size:clamp(prefs.size+1,14,32)})}>A+</button></div></div>
  <div className="rs-row"><span>{t('Line spacing')}</span><div className="rs-step"><button aria-label={t('Tighter lines')} onClick={()=>onChange({leading:clamp(Math.round((prefs.leading-0.1)*10)/10,1.3,2.4)})}>−</button><output>{prefs.leading.toFixed(1)}</output><button aria-label={t('Looser lines')} onClick={()=>onChange({leading:clamp(Math.round((prefs.leading+0.1)*10)/10,1.3,2.4)})}>+</button></div></div>
  <div className="rs-row"><span>{t('Width')}</span>{seg('width',[['narrow',t('Narrow')],['medium',t('Medium')],['wide',t('Wide')],['full',t('Full')]])}</div>
  <div className="rs-row"><span>{t('Font')}</span>{seg('font',[['serif','Serif'],['sans','Sans']])}</div>
  <div className="rs-foot"><button className="rs-reset" onClick={()=>onChange(READER_DEFAULTS)}>{t('Reset')}</button><small>{t('← → chapters · + − text size')}</small></div>
 </div>
}

// ---- Novel library ----------------------------------------------------------
type ReadingState={index:number,path?:string,scroll?:number,at?:number}
const readingOf=(id:string):ReadingState|null=>{try{const r=JSON.parse(localStorage.getItem('reading:'+id)||'null');return r&&Number.isInteger(r.index)?r:null}catch{return null}}
function timeAgo(at?:number){if(!at)return '';const s=Math.max(0,(Date.now()-at)/1000);if(s<60)return t('just now');const m=s/60;if(m<60)return t('{n} min ago',{n:Math.floor(m)});const h=m/60;if(h<24)return t('{n} h ago',{n:Math.floor(h)});const d=Math.floor(h/24);if(d<7)return plural(d,'{n} day ago','{n} days ago');return new Date(at).toLocaleDateString(getLang())}
function initials(name:string){return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?'}
function hueOf(name:string){let h=0;for(const ch of String(name))h=(h*31+ch.charCodeAt(0))%360;return h}
function Cover({src,name}:{src?:string,name:string}){const[failed,setFailed]=useState(false);if(src&&!failed)return <img className="libcover" src={src} alt="" loading="lazy" onError={()=>setFailed(true)}/>;const h=hueOf(name);return <div className="libcover placeholder" aria-hidden="true" style={{background:`linear-gradient(150deg,hsl(${h} 45% 32%),hsl(${(h+40)%360} 50% 18%))`}}>{initials(name)}</div>}
type LibSort='recent'|'added'|'title'|'unread'
type Removed={novel:any,position:number,reading:string|null}
type UpdateState={running:boolean,done:number,total:number,found:number,failed:number,at:number}
function NovelLibrary({library,updates,onCheckUpdates,onOpen,onDetails,onRemove,onRestore,onSearch}:{library:any[],updates:UpdateState,onCheckUpdates:()=>void,onOpen:(n:any)=>void,onDetails:(n:any)=>void,onRemove:(n:any)=>Removed,onRestore:(r:Removed)=>void,onSearch:()=>void}){
 const[filter,setFilter]=useState(''),[sort,setSort]=useState<LibSort>(()=>(lsGet('librarySort') as LibSort)||'recent'),[undo,setUndo]=useState<Removed|null>(null)
 useEffect(()=>{if(!undo)return;const t=setTimeout(()=>setUndo(null),7000);return()=>clearTimeout(t)},[undo])
 const rows=library.map(n=>{const r=readingOf(n.id),total=Number(n.chapterCount)||n.chapters?.length||0,done=r?r.index+1:0;return{n,r,total,done,left:Math.max(0,total-done)}})
 const q=filter.trim().toLowerCase()
 const shown=rows.filter(x=>!q||(x.n.name+' '+(x.n.author||'')+' '+(x.n.source?.name||'')).toLowerCase().includes(q)).sort((a,b)=>sort==='title'?String(a.n.name).localeCompare(String(b.n.name)):sort==='added'?(b.n.addedAt||0)-(a.n.addedAt||0):sort==='unread'?b.left-a.left:((Number(b.n.newChapters)>0?1:0)-(Number(a.n.newChapters)>0?1:0))||((b.r?.at||0)-(a.r?.at||0))||((b.n.addedAt||0)-(a.n.addedAt||0)))
 const last=rows.filter(x=>x.r?.at).sort((a,b)=>(b.r!.at!)-(a.r!.at!))[0]
 const lastTitle=(x:typeof rows[number])=>{const c=x.n.chapters?.[x.r!.index];return c?.name||c?.title||t('Chapter {n}',{n:x.r!.index+1})}
 return <>
  <header><div><h1>{t('Your Library')}</h1><p>{plural(library.length,'{n} novel saved locally.','{n} novels saved locally.')}</p></div></header>
  {library.length===0?<section className="panel lib-empty"><h2>{t('Your library is empty')}</h2><p>{t('Search your sources for a novel, pick a result and it will be saved here.')}</p><button className="primary" onClick={onSearch}>{t('Search novels')}</button></section>:<>
   {last&&!q&&<section className="lib-resume" onClick={()=>onOpen(last.n)}>
    <Cover src={last.n.cover} name={last.n.name}/>
    <div className="lib-resume-meta"><small>{t('Continue where you left off')} · {timeAgo(last.r!.at)}</small><h2>{last.n.name}</h2><p>{lastTitle(last)}</p><div className="libbar"><span style={{width:(last.total?Math.min(100,last.done/last.total*100):0)+'%'}}/></div></div>
    <button className="primary" onClick={e=>{e.stopPropagation();onOpen(last.n)}}>{t('Continue · Ch. {n}',{n:last.r!.index+1})}</button>
   </section>}
   <div className="lib-toolbar"><div className="searchbar"><input placeholder={t('Filter by title, author or source…')} value={filter} onChange={e=>setFilter(e.target.value)} aria-label={t('Filter by title, author or source…')}/></div>
    <button className="lib-update" disabled={updates.running} onClick={onCheckUpdates} title={updates.at?t('Last check: {when}',{when:timeAgo(updates.at)}):undefined}>{updates.running?t('Checking {done}/{total}…',{done:updates.done,total:updates.total}):t('Check for new chapters')}</button>
    <label className="lib-sort">{t('Sort')}<select value={sort} onChange={e=>{const v=e.target.value as LibSort;setSort(v);lsSet('librarySort',v)}}><option value="recent">{t('Recently read')}</option><option value="added">{t('Recently added')}</option><option value="title">{t('Title A–Z')}</option><option value="unread">{t('Most unread')}</option></select></label></div>
   {!updates.running&&updates.at>0&&updates.total>0&&<p className="lib-update-status" role="status">{updates.found?plural(updates.found,'{n} novel has new chapters.','{n} novels have new chapters.'):t('Everything is up to date.')}{updates.failed?' '+plural(updates.failed,'{n} source did not answer.','{n} sources did not answer.'):''}</p>}
   {shown.length===0?<section className="panel"><p>{t('No novel matches “{q}”.',{q:filter})}</p></section>:<section className="libgrid">{shown.map(({n,r,total,done,left})=><article className="libcard" key={n.id}>
    <button className="libcard-cover" onClick={()=>onDetails(n)} aria-label={t('Chapters of {name}',{name:n.name})} title={t('Show chapters')}><Cover src={n.cover} name={n.name}/></button>
    <div className="libcard-meta">
     <h2 title={n.name}><button className="libtitle" onClick={()=>onDetails(n)}>{n.name}</button></h2>
     {Number(n.newChapters)>0&&<span className="newbadge">{t('+{n} new',{n:n.newChapters})}</span>}
     <p>{[n.author,n.source?.name].filter(Boolean).join(' · ')}</p>
     <div className="libbar" title={t('{done} of {total} chapters',{done,total})}><span style={{width:(total?Math.min(100,done/total*100):0)+'%'}}/></div>
     <small>{r?`${done} / ${total} · ${t('{n} left',{n:left})}${r.at?' · '+timeAgo(r.at):''}`:plural(total,'{n} chapter','{n} chapters')+' · '+t('not started')}</small>
     <div className="libraryactions"><button className="primary" onClick={()=>onOpen(n)}>{r?t('Continue · Ch. {n}',{n:r.index+1}):t('Start reading')}</button><button className="removebtn" onClick={()=>setUndo(onRemove(n))}>{t('Remove')}</button></div>
    </div></article>)}</section>}
  </>}
  {undo&&<div className="anime-toast ok lib-undo" role="status"><span>{t('Removed “{name}”.',{name:undo.novel.name})}</span><div><button className="undo-btn" onClick={()=>{onRestore(undo);setUndo(null)}}>{t('Undo')}</button><button aria-label={t('Dismiss')} onClick={()=>setUndo(null)}>×</button></div></div>}
 </>
}

// ---- Novel detail (chapter list) ---------------------------------------------
function NovelDetail({novel,filter,setFilter,loading,onBack,onOpenChapter,onContinue}:{novel:any,filter:string,setFilter:(v:string)=>void,loading:boolean,onBack:()=>void,onOpenChapter:(c:any,i:number)=>void,onContinue:()=>void}){
 const chapters:any[]=novel.chapters||[],total=chapters.length||Number(novel.chapterCount)||0
 const r=readingOf(novel.id),current=r?r.index:-1,done=r?r.index+1:0
 const[newestFirst,setNewestFirst]=useState(()=>lsGet('chapterOrder')==='desc'),[hideRead,setHideRead]=useState(()=>lsGet('chapterHideRead')==='1'),[clicked,setClicked]=useState(-1)
 const listRef=useRef<HTMLDivElement>(null)
 const q=filter.trim().toLowerCase()
 const rows=chapters.map((c,i)=>({c,i,label:String(c.name||c.title||t('Chapter {n}',{n:i+1}))}))
  .filter(x=>!q||x.label.toLowerCase().includes(q)||String(x.i+1)===q||String(x.i+1).startsWith(q)&&/^\d+$/.test(q))
  .filter(x=>!hideRead||x.i>=current)
 if(newestFirst)rows.reverse()
 const jumpToCurrent=(smooth=true)=>{const el=listRef.current?.querySelector<HTMLElement>('.chapterrow.current');if(el&&listRef.current){const box=listRef.current;box.scrollTo({top:el.offsetTop-box.offsetTop-box.clientHeight/2+el.clientHeight/2,behavior:smooth?'smooth':'auto'})}}
 useEffect(()=>{requestAnimationFrame(()=>jumpToCurrent(false))},[novel.id])
 useEffect(()=>{if(!loading)setClicked(-1)},[loading])
 const open=(c:any,i:number)=>{setClicked(i);onOpenChapter(c,i)}
 return <>
  <header><div><button className="backbtn" onClick={onBack}>← {t('Library')}</button></div></header>
  <section className="novelhead">
   <div className="novelhead-cover"><Cover src={novel.cover} name={novel.name}/></div>
   <div className="novelhead-meta">
    <h1>{novel.name}</h1>
    <p>{[novel.author||t('Unknown author'),novel.source?.name].filter(Boolean).join(' · ')}</p>
    <div className="libbar"><span style={{width:(total?Math.min(100,done/total*100):0)+'%'}}/></div>
    <small>{r?`${t('{done} / {total} read',{done,total})} · ${t('{n} left',{n:Math.max(0,total-done)})}${r.at?' · '+t('last read {when}',{when:timeAgo(r.at)}):''}`:plural(total,'{n} chapter','{n} chapters')+' · '+t('not started')}</small>
    <div className="libraryactions">{r?<button className="primary" disabled={loading} onClick={()=>{setClicked(-2);onContinue()}}>{loading&&clicked===-2?t('Loading…'):t('Continue · Ch. {n}',{n:current+1})}</button>:<button className="primary" disabled={loading||!chapters.length} onClick={()=>open(chapters[0],0)}>{t('Start reading')}</button>}{r&&<button onClick={()=>{if(hideRead){setHideRead(false);lsSet('chapterHideRead','0')}requestAnimationFrame(()=>jumpToCurrent())}}>{t('Show current chapter')}</button>}</div>
   </div>
  </section>
  <section className="chapterarea">
   <div className="chaptertools"><div className="searchbar"><input placeholder={t('Filter by title or chapter number…')} value={filter} onChange={e=>setFilter(e.target.value)} aria-label={t('Filter by title or chapter number…')}/></div>
    <div className="rs-seg chapter-order" role="radiogroup" aria-label={t('Order')}><button role="radio" aria-checked={!newestFirst} className={!newestFirst?'on':''} onClick={()=>{setNewestFirst(false);lsSet('chapterOrder','asc')}}>{t('Oldest first')}</button><button role="radio" aria-checked={newestFirst} className={newestFirst?'on':''} onClick={()=>{setNewestFirst(true);lsSet('chapterOrder','desc')}}>{t('Newest first')}</button></div>
    <label className="hideread"><input type="checkbox" checked={hideRead} onChange={e=>{setHideRead(e.target.checked);lsSet('chapterHideRead',e.target.checked?'1':'0')}}/> {t('Hide read')}</label></div>
   <small className="chaptercount">{rows.length===total?plural(total,'{n} chapter','{n} chapters'):t('{done} of {total} chapters',{done:rows.length,total})}</small>
   {rows.length===0?<p className="chapterempty">{t('No chapter matches.')}</p>:<div className="chapterlist" ref={listRef}>{rows.map(({c,i,label})=>{const state=i<current?'read':i===current?'current':'';return <button className={'chapterrow '+state} disabled={loading} onClick={()=>open(c,i)} key={(c.path||c.url||'chapter')+i} aria-current={state==='current'?'true':undefined}>
    <span className="chaptername">{state==='read'&&<span className="chaptercheck" aria-label={t('Read')}>✓</span>}{label}</span>
    <small>{loading&&clicked===i?t('Loading…'):state==='current'?t('Reading · Ch. {n}',{n:i+1}):t('Ch. {n}',{n:i+1})}</small></button>})}</div>}
  </section>
 </>
}

// ---- Backup helpers (renderer side) ------------------------------------------
// Everything the app keeps in localStorage is user data (library, progress,
// preferences) except cached plugin code, which is re-downloaded on demand.
const BACKUP_SKIP=(k:string)=>k.startsWith('plugin:')
function collectBackup():BackupPayload{const data:Record<string,string>={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)!;if(!BACKUP_SKIP(k)){const v=localStorage.getItem(k);if(v!=null)data[k]=v}}return{app:'NovelReader',version:1,exportedAt:Date.now(),data}}
async function applyBackup(payload:BackupPayload){
 // Safety copy of the current data first, so a restore can always be undone.
 try{await window.novelReader.backupAuto(collectBackup(),true)}catch{}
 const keep:Record<string,string>={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)!;if(BACKUP_SKIP(k))keep[k]=localStorage.getItem(k)||''}
 localStorage.clear();for(const[k,v]of Object.entries(keep))localStorage.setItem(k,v);for(const[k,v]of Object.entries(payload.data))localStorage.setItem(k,v)
 location.reload()
}
const fmtDateTime=(ms:number)=>ms?new Date(ms).toLocaleString(getLang(),{dateStyle:'medium',timeStyle:'short'}):''

function SettingsPage({lang,onLang,onWelcome}:{lang:Lang,onLang:(l:Lang)=>void,onWelcome:()=>void}){
 const[autos,setAutos]=useState<{name:string,novels:number,exportedAt:number}[]>([]),[msg,setMsg]=useState<{ok:boolean,text:string}|null>(null),[confirm,setConfirm]=useState<string|null>(null),[busy,setBusy]=useState(false)
 const[autoCheck,setAutoCheck]=useState(()=>lsGet('autoCheckUpdates')!=='0')
 const refresh=async()=>{try{setAutos(await window.novelReader.backupListAuto())}catch{}}
 useEffect(()=>{refresh()},[])
 useEffect(()=>{if(!confirm)return;const tm=setTimeout(()=>setConfirm(null),6000);return()=>clearTimeout(tm)},[confirm])
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMsg(null);try{await fn()}catch(e:any){setMsg({ok:false,text:t(String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/,''))})}finally{setBusy(false)}}
 const doExport=()=>run(async()=>{const r=await window.novelReader.backupExport(collectBackup());if(r.ok)setMsg({ok:true,text:t('Backup saved: {path}',{path:r.path||''})})})
 const doImport=()=>run(async()=>{const r=await window.novelReader.backupImport();if(!r.ok||!r.payload)return;if(!window.confirm(t('Replace your current library and settings with this backup ({n})?',{n:plural(r.novels||0,'{n} novel','{n} novels')})))return;await applyBackup(r.payload)})
 const doRestoreAuto=(name:string)=>{if(confirm!==name){setConfirm(name);return}run(async()=>{await applyBackup(await window.novelReader.backupReadAuto(name))})}
 const doBackupNow=()=>run(async()=>{const r=await window.novelReader.backupAuto(collectBackup(),true);setMsg({ok:true,text:r.saved?t('Automatic backup created.'):t('Nothing changed since the last backup.')});refresh()})
 return <>
  <header><div><h1>{t('Settings')}</h1><p>{t('Language, backups and updates.')}</p></div></header>
  <section className="panel settings-block"><h2>{t('Language')}</h2>
   <div className="rs-seg settings-seg" role="radiogroup" aria-label={t('Language')}>{LANGS.map(l=><button key={l.id} role="radio" aria-checked={lang===l.id} className={lang===l.id?'on':''} onClick={()=>onLang(l.id)}>{l.label}</button>)}</div>
  </section>
  <section className="panel settings-block"><h2>{t('Backup and restore')}</h2>
   <p className="settings-help">{t('Your library, reading progress and preferences are stored on this PC. Export a backup file to keep them safe or to move them to another computer.')}</p>
   <div className="libraryactions"><button className="primary" disabled={busy} onClick={doExport}>{t('Export a backup…')}</button><button disabled={busy} onClick={doImport}>{t('Restore from a file…')}</button></div>
   {msg&&<div className={'anime-toast '+(msg.ok?'ok':'error')} role="status"><NoticeText text={msg.text}/><button aria-label={t('Dismiss')} onClick={()=>setMsg(null)}>×</button></div>}
   <h3 className="settings-sub">{t('Automatic backups')}</h3>
   <p className="settings-help">{t('NovelReader keeps the last 10 versions of your data automatically. A copy of the current data is also saved before any restore.')}</p>
   {autos.length===0?<p className="settings-help">{t('No automatic backup yet.')}</p>:<div className="scanlist">{autos.map(a=><div className="scanrow settings-row" key={a.name}><span>{fmtDateTime(a.exportedAt)}</span><small>{plural(a.novels,'{n} novel','{n} novels')}</small><button className={confirm===a.name?'danger':undefined} disabled={busy} onClick={()=>doRestoreAuto(a.name)}>{confirm===a.name?t('Confirm restore'):t('Restore')}</button></div>)}</div>}
   <div className="libraryactions"><button disabled={busy} onClick={doBackupNow}>{t('Back up now')}</button><button onClick={()=>window.novelReader.backupOpenFolder().catch(e=>setMsg({ok:false,text:String(e?.message||e)}))}>{t('Open backups folder')}</button></div>
  </section>
  <section className="panel settings-block"><h2>{t('New chapters')}</h2>
   <label className="settings-check"><input type="checkbox" checked={autoCheck} onChange={e=>{setAutoCheck(e.target.checked);lsSet('autoCheckUpdates',e.target.checked?'1':'0')}}/> {t('Check my library for new chapters when NovelReader starts (at most every 12 hours)')}</label>
  </section>
  <section className="panel settings-block"><h2>{t('About')}</h2><p className="settings-help">NovelReader · Windows · v0.2 alpha</p><button onClick={onWelcome}>{t('Show the welcome guide again')}</button></section>
 </>
}

// ---- Error boundary: a crashing page shows a recovery screen, not a black window
class ErrorBoundary extends React.Component<{children:React.ReactNode,resetKey?:string,onHome?:()=>void,full?:boolean},{error:any}>{
 state={error:null as any}
 static getDerivedStateFromError(error:any){return{error}}
 componentDidCatch(error:any,info:any){console.error('[NovelReader] UI error',error,info?.componentStack)}
 componentDidUpdate(prev:any){if(prev.resetKey!==this.props.resetKey&&this.state.error)this.setState({error:null})}
 render(){
  if(!this.state.error)return this.props.children
  const e=this.state.error,detail=String(e?.stack||e)
  return <div className={this.props.full?'crash crash-full':'crash'} role="alert"><section className="panel">
   <h2>{t('Something went wrong on this page')}</h2>
   <p>{t('Your library and reading progress are safe. You can go back to the library or reload NovelReader.')}</p>
   <div className="libraryactions">{this.props.onHome&&<button className="primary" onClick={()=>{this.setState({error:null});this.props.onHome!()}}>{t('Back to library')}</button>}<button className={this.props.onHome?undefined:'primary'} onClick={()=>location.reload()}>{t('Reload')}</button></div>
   <div className="crash-detail"><NoticeText text={t('Error:')+' '+String(e?.message||e)+' | '+detail}/></div>
  </section></div>
 }
}

// ---- Welcome guide (first launch) ------------------------------------------------
function Welcome({lang,onLang,onClose,onSearch}:{lang:Lang,onLang:(l:Lang)=>void,onClose:()=>void,onSearch:()=>void}){
 const[step,setStep]=useState(0),ref=useRef<HTMLDivElement>(null)
 useEffect(()=>{ref.current?.querySelector<HTMLElement>('.welcome-body button, .welcome-actions .primary')?.focus()},[step])
 const steps=[
  <><h1>{t('Welcome to NovelReader')}</h1><p>{t('Read web novels, keep track of where you are, and watch your own videos — all in one place. First, choose your language:')}</p>
   <div className="rs-seg welcome-lang" role="radiogroup" aria-label={t('Language')}>{LANGS.map(l=><button key={l.id} role="radio" aria-checked={lang===l.id} className={lang===l.id?'on':''} onClick={()=>onLang(l.id)}>{l.label}</button>)}</div></>,
  <><h1>{t('What you can do')}</h1><ul className="welcome-list">
   <li><Icon name="book"/><div><b>{t('Read novels')}</b><span>{t('Search hundreds of sources, add novels to your library and continue exactly where you stopped.')}</span></div></li>
   <li><Icon name="folder"/><div><b>{t('Watch your videos')}</b><span>{t('Play the video files stored on this PC, grouped by folder, with resume and shortcuts.')}</span></div></li>
   <li><Icon name="archive"/><div><b>{t('Discover public-domain classics')}</b><span>{t('Stream free films and cartoons from the Internet Archive.')}</span></div></li>
   <li><Icon name="gear"/><div><b>{t('Stay safe')}</b><span>{t('Your data is backed up automatically. Settings lets you export it or move it to another PC.')}</span></div></li></ul></>,
  <><h1>{t('Add your first novel')}</h1><ol className="welcome-steps">
   <li><span>1</span>{t('Open Global Search and type a title.')}</li>
   <li><span>2</span>{t('Pick a result: NovelReader adds it to your library.')}</li>
   <li><span>3</span>{t('Click Continue in your library to start reading.')}</li></ol>
   <p className="welcome-tip">{t('Tip: press ? at any time to see the keyboard shortcuts.')}</p></>
 ]
 const last=step===steps.length-1
 return <div className="kbd-overlay welcome-overlay"><div className="welcome" role="dialog" aria-modal="true" aria-label={t('Welcome to NovelReader')} ref={ref}>
  <div className="welcome-dots" aria-hidden="true">{steps.map((_,i)=><span key={i} className={i===step?'on':''}/>)}</div>
  <div className="welcome-body">{steps[step]}</div>
  <div className="welcome-actions">
   <button className="welcome-skip" onClick={onClose}>{t('Skip')}</button>
   <div>{step>0&&<button onClick={()=>setStep(step-1)}>{t('Back')}</button>}
    {last?<><button onClick={onClose}>{t('Explore on my own')}</button><button className="primary" onClick={()=>{onClose();onSearch()}}>{t('Search a novel')}</button></>:<button className="primary" onClick={()=>setStep(step+1)}>{t('Next')}</button>}</div>
  </div>
 </div></div>
}

// ---- Read aloud (Web Speech API, uses the voices installed in Windows) ------------
type TtsPrefs={rate:number,voice:string,autoNext:boolean}
function loadTts():TtsPrefs{try{const x=JSON.parse(lsGet('ttsPrefs')||'{}')||{};return{rate:clamp(Number(x.rate)||1,0.5,2.5),voice:typeof x.voice==='string'?x.voice:'',autoNext:x.autoNext!==false}}catch{return{rate:1,voice:'',autoNext:true}}}
function useVoices(){const[v,setV]=useState<SpeechSynthesisVoice[]>([]);useEffect(()=>{const ss=window.speechSynthesis;if(!ss)return;const upd=()=>setV(ss.getVoices());upd();ss.addEventListener?.('voiceschanged',upd);return()=>ss.removeEventListener?.('voiceschanged',upd)},[]);return v}
function readableBlocks(root:HTMLElement|null):HTMLElement[]{if(!root)return[];const els=[...root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,p,li,blockquote')].filter(e=>(e.textContent||'').trim().length>1&&!e.querySelector('p,li,blockquote'));return els.length?els:[root]}
function ReaderTTS({rootRef,chapterKey,hasNext,onNext,onClose}:{rootRef:React.RefObject<HTMLElement|null>,chapterKey:string,hasNext:boolean,onNext:()=>void,onClose:()=>void}){
 const voices=useVoices(),[prefs,setPrefs]=useState<TtsPrefs>(loadTts),[playing,setPlaying]=useState(false),[idx,setIdx]=useState(0),[err,setErr]=useState('')
 const playingRef=useRef(false),idxRef=useRef(0),token=useRef(0),pendingNext=useRef(false),prefsRef=useRef(prefs)
 prefsRef.current=prefs
 const supported=typeof window!=='undefined'&&'speechSynthesis' in window
 const savePrefs=(patch:Partial<TtsPrefs>)=>setPrefs(p=>{const n={...p,...patch};lsSet('ttsPrefs',JSON.stringify(n));return n})
 const mark=(i:number)=>{const els=readableBlocks(rootRef.current);els.forEach((e,j)=>e.classList.toggle('tts-current',j===i));return els}
 const voiceFor=()=>{const vs=window.speechSynthesis.getVoices();return vs.find(v=>v.voiceURI===prefsRef.current.voice)||vs.find(v=>v.lang.toLowerCase().startsWith(getLang()))||null}
 const speak=(i:number)=>{
  const els=readableBlocks(rootRef.current)
  if(i>=els.length){mark(-1);if(prefsRef.current.autoNext&&hasNextRef.current){pendingNext.current=true;onNextRef.current()}else{playingRef.current=false;setPlaying(false);idxRef.current=0;setIdx(0)}return}
  idxRef.current=i;setIdx(i);mark(i)
  els[i].scrollIntoView({block:'center',behavior:'smooth'})
  const u=new SpeechSynthesisUtterance((els[i].textContent||'').replace(/\s+/g,' ').trim())
  const v=voiceFor();if(v){u.voice=v;u.lang=v.lang}
  u.rate=prefsRef.current.rate
  const tok=++token.current
  u.onend=()=>{if(tok===token.current&&playingRef.current)speak(i+1)}
  u.onerror=(e:any)=>{if(tok!==token.current||e?.error==='interrupted'||e?.error==='canceled')return;setErr(t('The voice stopped unexpectedly.')+' ('+(e?.error||'error')+')');playingRef.current=false;setPlaying(false)}
  window.speechSynthesis.cancel();window.speechSynthesis.speak(u)
 }
 const hasNextRef=useRef(hasNext),onNextRef=useRef(onNext);hasNextRef.current=hasNext;onNextRef.current=onNext
 const play=()=>{if(!supported)return;setErr('');playingRef.current=true;setPlaying(true);speak(idxRef.current)}
 const pause=()=>{playingRef.current=false;setPlaying(false);token.current++;window.speechSynthesis?.cancel()}
 const jump=(d:number)=>{const n=Math.max(0,Math.min(readableBlocks(rootRef.current).length-1,idxRef.current+d));if(playingRef.current)speak(n);else{idxRef.current=n;setIdx(n);mark(n)}}
 // New chapter: start over, and keep reading if we got here by finishing the previous one.
 useEffect(()=>{idxRef.current=0;setIdx(0);mark(-1);if(pendingNext.current&&playingRef.current){pendingNext.current=false;const tm=setTimeout(()=>speak(0),400);return()=>clearTimeout(tm)}pendingNext.current=false},[chapterKey])
 // Click a paragraph to read from there.
 useEffect(()=>{const root=rootRef.current;if(!root)return;const onClick=(e:MouseEvent)=>{if((e.target as HTMLElement).closest('a'))return;const els=readableBlocks(root);const i=els.findIndex(el=>el.contains(e.target as Node));if(i<0)return;if(playingRef.current)speak(i);else{idxRef.current=i;setIdx(i);mark(i)}};root.addEventListener('click',onClick);root.classList.add('tts-on');return()=>{root.removeEventListener('click',onClick);root.classList.remove('tts-on')}},[chapterKey])
 useEffect(()=>()=>{token.current++;window.speechSynthesis?.cancel();mark(-1)},[])
 const total=readableBlocks(rootRef.current).length
 return <div className="tts-panel" role="region" aria-label={t('Read aloud')}>
  {!supported?<span>{t('Read aloud is not available on this system.')}</span>:<>
   <div className="tts-main">
    <button className="tts-btn" onClick={()=>jump(-1)} aria-label={t('Previous paragraph')} title={t('Previous paragraph')}>⏮</button>
    <button className="tts-btn tts-play" onClick={playing?pause:play} aria-label={playing?t('Pause'):t('Read aloud')}>{playing?'❚❚':'▶'}</button>
    <button className="tts-btn" onClick={()=>jump(1)} aria-label={t('Next paragraph')} title={t('Next paragraph')}>⏭</button>
    <small className="tts-pos">{t('Paragraph {n} of {total}',{n:Math.min(idx+1,Math.max(total,1)),total:Math.max(total,1)})}</small>
   </div>
   <div className="tts-opts">
    <label>{t('Speed')}<select value={String(prefs.rate)} onChange={e=>{savePrefs({rate:Number(e.target.value)});if(playingRef.current)setTimeout(()=>speak(idxRef.current),0)}}>{[0.75,1,1.25,1.5,1.75,2].map(r=><option key={r} value={String(r)}>{r}×</option>)}</select></label>
    <label>{t('Voice')}<select value={prefs.voice} onChange={e=>{savePrefs({voice:e.target.value});if(playingRef.current)setTimeout(()=>speak(idxRef.current),0)}}><option value="">{t('Automatic')}</option>{voices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select></label>
    <label className="tts-check"><input type="checkbox" checked={prefs.autoNext} onChange={e=>savePrefs({autoNext:e.target.checked})}/> {t('Continue to the next chapter')}</label>
   </div>
   {err&&<small className="tts-err">{err}</small>}
  </>}
  <button className="tts-close" onClick={()=>{pause();onClose()}} aria-label={t('Close')}>×</button>
 </div>
}

// React 19 re-applies dangerouslySetInnerHTML whenever the prop object changes,
// which rebuilt the whole chapter on every scroll-driven render (losing text
// selection and highlights). Keep one stable object per chapter content.
const chapterHtmlCache={src:null as any,obj:{__html:''}}
function chapterHtml(content:any){if(content!==chapterHtmlCache.src){chapterHtmlCache.src=content;chapterHtmlCache.obj={__html:String(content||'').replace(/<script[\s\S]*?<\/script>/gi,'')}}return chapterHtmlCache.obj}

// ---- Global search (novels, manhwa, manhua, manga) ------------------------------
type SearchHit={plugin:Plugin,novel:any}
type SearchGroup={key:string,title:string,cover:string,hits:SearchHit[],score:number}
const normTitle=(x:string)=>String(x||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()
function preferredLang(l:string){const v=String(l||'').toLowerCase();return /^en|english|anglais/.test(v)||/multi|all/.test(v)||(getLang()==='fr'&&/^fr|french|fran/.test(v))}
function NovelSearch({query,setQuery,plugins,ensurePlugins,library,onAdd,onOpen}:{query:string,setQuery:(q:string)=>void,plugins:Plugin[],ensurePlugins:()=>Promise<Plugin[]>,library:any[],onAdd:(h:SearchHit)=>Promise<any>,onOpen:(item:any)=>void}){
 const[hits,setHits]=useState<SearchHit[]>([]),[status,setStatus]=useState<{running:boolean,checked:number,total:number,errors:number,query:string,stopped?:boolean}|null>(null),[err,setErr]=useState('')
 const[langs,setLangs]=useState<string[]|null>(()=>{try{const x=JSON.parse(lsGet('searchLangs')||'null');return Array.isArray(x)?x:null}catch{return null}})
 const[recent,setRecent]=useState<string[]>(()=>{try{return JSON.parse(lsGet('recentSearches')||'[]')}catch{return[]}})
 const[adding,setAdding]=useState(''),[added,setAdded]=useState<any>(null)
 const runToken=useRef(0)
 useEffect(()=>{if(!plugins.length)ensurePlugins().catch(e=>setErr(t('Could not load the source list:')+' '+String(e?.message||e)))},[])
 useEffect(()=>()=>{runToken.current++},[])
 // Languages available, most sources first; default = UI language + English + multi.
 const langCounts=new Map<string,number>();for(const pl of plugins){const l=String(pl.lang||'?');langCounts.set(l,(langCounts.get(l)||0)+1)}
 const allLangs=[...langCounts.entries()].sort((a,b)=>b[1]-a[1]).map(([l])=>l)
 const selected=langs??allLangs.filter(preferredLang)
 const pool=plugins.filter(pl=>selected.includes(String(pl.lang||'?')))
 const toggleLang=(l:string)=>{const next=selected.includes(l)?selected.filter(x=>x!==l):[...selected,l];setLangs(next);lsSet('searchLangs',JSON.stringify(next))}
 const setAllLangs=(all:boolean)=>{const next=all?allLangs:allLangs.filter(preferredLang);setLangs(next);lsSet('searchLangs',JSON.stringify(next))}
 const run=async(qIn?:string)=>{
  const q=(qIn??query).trim();if(!q)return
  if(qIn!=null)setQuery(qIn)
  const token=++runToken.current
  setErr('');setHits([]);setAdded(null)
  let list=plugins;if(!list.length){setStatus({running:true,checked:0,total:0,errors:0,query:q});try{list=await ensurePlugins()}catch(e:any){setErr(t('Could not load the source list:')+' '+String(e?.message||e));setStatus(null);return}}
  const targets=list.filter(pl=>selected.includes(String(pl.lang||'?')))
  if(!targets.length){setErr(t('Choose at least one language.'));return}
  const nextRecent=[q,...recent.filter(r=>r.toLowerCase()!==q.toLowerCase())].slice(0,6);setRecent(nextRecent);lsSet('recentSearches',JSON.stringify(nextRecent))
  let checked=0,errors=0;const found:SearchHit[]=[],queue=[...targets],words=normTitle(q).split(' ').filter(Boolean)
  setStatus({running:true,checked,total:targets.length,errors,query:q})
  const worker=async()=>{while(queue.length&&token===runToken.current){const plugin=queue.shift()!
   try{const results=await window.novelReader.searchPlugin(plugin,q);if(token!==runToken.current)return
    const ok=(results||[]).filter((n:any)=>{const nt=normTitle(n?.name);return nt&&words.every(w=>nt.includes(w))})
    if(ok.length){ok.forEach((novel:any)=>found.push({plugin,novel}));setHits([...found])}
   }catch{errors++}
   if(token!==runToken.current)return
   checked++;setStatus(st=>st&&{...st,checked,errors})}}
  await Promise.all(Array.from({length:8},worker))
  if(token===runToken.current)setStatus(st=>st&&{...st,running:false})
 }
 const stop=()=>{runToken.current++;setStatus(st=>st&&{...st,running:false,stopped:true})}
 // Group the same title found on several sources.
 const groups:SearchGroup[]=[];const byKey=new Map<string,SearchGroup>();const qn=normTitle(status?.query||query)
 for(const h of hits){const key=normTitle(h.novel.name);let g=byKey.get(key);if(!g){g={key,title:h.novel.name,cover:h.novel.cover||'',hits:[],score:key===qn?2:key.startsWith(qn)?1:0};byKey.set(key,g);groups.push(g)}if(!g.cover&&h.novel.cover)g.cover=h.novel.cover;g.hits.push(h)}
 groups.sort((a,b)=>b.score-a.score||b.hits.length-a.hits.length)
 const inLibrary=(h:SearchHit)=>library.find(x=>x.id===h.plugin.id+':'+h.novel.path)
 const add=async(h:SearchHit)=>{const id=h.plugin.id+':'+h.novel.path;setAdding(id);setErr('');try{const item=await onAdd(h);setAdded(item)}catch(e:any){setErr(t('Could not add novel:')+' '+String(e?.message||e))}finally{setAdding('')}}
 const pct=status&&status.total?Math.round(status.checked/status.total*100):0
 return <>
  <header><div><h1>{t('Find a title everywhere')}</h1><p>{t('Novels, manhwa, manhua and manga: search every LNReader source without installing it first.')}</p></div></header>
  <form className="searchbar search-main" onSubmit={e=>{e.preventDefault();status?.running?stop():run()}}>
   <input placeholder={t('Title, e.g. Shadow Slave or Solo Leveling')} value={query} onChange={e=>setQuery(e.target.value)} aria-label={t('Search')}/>
   <button type="submit" className={status?.running?'stopbtn':'primary'} disabled={!status?.running&&!query.trim()}>{status?.running?t('Stop'):t('Search')}</button>
  </form>
  <div className="langbar"><span>{t('Languages')}</span>
   {allLangs.length===0?<small>{t('Loading sources…')}</small>:<>{allLangs.slice(0,10).map(l=><button key={l} className={'chip'+(selected.includes(l)?' on':'')} aria-pressed={selected.includes(l)} onClick={()=>toggleLang(l)}>{l} <small>{langCounts.get(l)}</small></button>)}
    {allLangs.length>10&&<details className="morelangs"><summary className="chip">{t('+{n} more',{n:allLangs.length-10})}</summary><div>{allLangs.slice(10).map(l=><button key={l} className={'chip'+(selected.includes(l)?' on':'')} aria-pressed={selected.includes(l)} onClick={()=>toggleLang(l)}>{l} <small>{langCounts.get(l)}</small></button>)}</div></details>}
    <button className="chip ghost" onClick={()=>setAllLangs(selected.length!==allLangs.length)}>{selected.length===allLangs.length?t('Default languages'):t('All languages')}</button>
    <small className="langcount">{plural(pool.length,'{n} source selected','{n} sources selected')}</small></>}
  </div>
  {status&&<div className={'searchstatus'+(status.running?' running':'')} role="status" aria-live="polite">
   <div className="searchstatus-text">{status.running?(status.total?<><span className="spinner" aria-hidden="true"/>{t('Searching {checked} / {total} sources…',{checked:status.checked,total:status.total})}</>:<><span className="spinner" aria-hidden="true"/>{t('Loading sources…')}</>):status.stopped?t('Search stopped after {checked} of {total} sources.',{checked:status.checked,total:status.total}):t('Search finished: {n} sources checked.',{n:status.total})}
    <b>{plural(groups.length,'{n} title found','{n} titles found')}</b>{status.errors>0&&<small>{plural(status.errors,'{n} source did not answer.','{n} sources did not answer.')}</small>}</div>
   <div className="libbar"><span style={{width:pct+'%'}}/></div>
  </div>}
  {err&&<div className="anime-toast error search-toast"><NoticeText text={err}/><button aria-label={t('Dismiss')} onClick={()=>setErr('')}>×</button></div>}
  {added&&<div className="anime-toast ok search-toast" role="status"><span>{t('“{name}” was added to your library.',{name:added.name})}</span><div><button className="undo-btn" onClick={()=>onOpen(added)}>{t('Open')}</button><button aria-label={t('Dismiss')} onClick={()=>setAdded(null)}>×</button></div></div>}
  {!status&&!hits.length&&<section className="panel search-empty"><h2>{t('Search tips')}</h2><p>{t('Type the title as it is usually written in English. Pick the languages of the sources you want to search: fewer languages means faster results.')}</p>
   {recent.length>0&&<div className="recent"><span>{t('Recent searches')}</span>{recent.map(r=><button key={r} className="chip" onClick={()=>run(r)}>{r}</button>)}</div>}</section>}
  {status&&!status.running&&groups.length===0&&<section className="panel"><h2>{t('No title found')}</h2><p>{t('Check the spelling, try a shorter title, or select more languages.')}</p></section>}
  {groups.length>0&&<section className="resultgrid">{groups.map(g=>{const owned=g.hits.map(inLibrary).find(Boolean);const first=g.hits[0];const firstId=first.plugin.id+':'+first.novel.path
   return <article className="resultcard" key={g.key}>
    <Cover src={g.cover} name={g.title}/>
    <div className="resultmeta"><h3 title={g.title}>{g.title}</h3>
     <small>{plural(g.hits.length,'Found on {n} source','Found on {n} sources')}</small>
     <div className="resultactions">{owned?<><span className="inlib">{t('In your library ✓')}</span><button onClick={()=>onOpen(owned)}>{t('Open')}</button></>:<button className="primary" disabled={!!adding} onClick={()=>add(first)}>{adding===firstId?t('Adding…'):t('Add from {source}',{source:first.plugin.name})}</button>}</div>
     {g.hits.length>1&&!owned&&<details className="othersources"><summary>{t('Other sources')}</summary><div>{g.hits.slice(1).map(h=>{const id=h.plugin.id+':'+h.novel.path;return <button key={id} className="chip" disabled={!!adding} onClick={()=>add(h)}>{adding===id?t('Adding…'):h.plugin.name} <small>{h.plugin.lang}</small></button>})}</div></details>}
    </div></article>})}</section>}
 </>
}

function App(){
 const[selectedAnime,setSelectedAnime]=useState<any>(null),[selectedEpisode,setSelectedEpisode]=useState<any>(null),[animeVideos,setAnimeVideos]=useState<any[]>([]),[selectedVideo,setSelectedVideo]=useState<any>(null),[animeVideoLoading,setAnimeVideoLoading]=useState(false),[animeDetailLoading,setAnimeDetailLoading]=useState(false),[page,setPageState]=useState<string>(()=>{const m=lsGet('mode');return startPage(isMode(m)?m:'books')}),[mode,setModeState]=useState<Mode>(()=>{const m=lsGet('mode');return isMode(m)?m:'books'}),[animeRepoUrl,setAnimeRepoUrl]=useState(()=>localStorage.getItem('animeRepoUrl')||'https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json'),[animeSources,setAnimeSources]=useState<any[]>([]),[animeCatalogFilter,setAnimeCatalogFilter]=useState(''),[selectedAnimeSource,setSelectedAnimeSource]=useState<any>(null),[animeEngine,setAnimeEngine]=useState<any>(null),[animeDebug,setAnimeDebug]=useState<any>(null),[animeNotice,setAnimeNotice]=useState<any>(null),[animeResults,setAnimeResults]=useState<any[]>([]),[animeSearchLog,setAnimeSearchLog]=useState<any[]>([]),[animeSearching,setAnimeSearching]=useState(false),[animeSourceLoading,setAnimeSourceLoading]=useState(false),[animeQuery,setAnimeQuery]=useState(''),[movieQuery,setMovieQuery]=useState(''),[movieSearching,setMovieSearching]=useState(false),[movieResults,setMovieResults]=useState<any[]>([]),[movieLibrary,setMovieLibrary]=useState<any[]>(()=>{try{return JSON.parse(localStorage.getItem('movieLibrary')||'[]')}catch{return []}}),[seriesQuery,setSeriesQuery]=useState(''),[seriesSearching,setSeriesSearching]=useState(false),[seriesResults,setSeriesResults]=useState<any[]>([]),[selectedSeries,setSelectedSeries]=useState<any>(null),[seriesLoading,setSeriesLoading]=useState(false),[seriesLibrary,setSeriesLibrary]=useState<any[]>(()=>{try{return JSON.parse(localStorage.getItem('seriesLibrary')||'[]')}catch{return []}}),[animeLibrary,setAnimeLibrary]=useState<any[]>(()=>{try{return JSON.parse(localStorage.getItem('animeLibrary')||'[]')}catch{return []}}),[comicTab,setComicTab]=useState<'all'|'manhwa'|'manhua'|'manga'>('all'),[comicQuery,setComicQuery]=useState(''),[comics,setComics]=useState<any[]>(()=>{try{return JSON.parse(localStorage.getItem('comicsLibrary')||'[]')}catch{return []}}),[readerTheme,setReaderTheme]=useState<'dark'|'light'>(()=>(localStorage.getItem('readerTheme') as 'dark'|'light')||'dark'),[reader,setReader]=useState<any>(null),[readerLoading,setReaderLoading]=useState(false),[selectedNovel,setSelectedNovel]=useState<any>(null),[chapterFilter,setChapterFilter]=useState(''),[library,setLibrary]=useState<any[]>(()=>{try{return JSON.parse(localStorage.getItem('library')||'[]')}catch{return []}}),[plugins,setPlugins]=useState<Plugin[]>([]),[filter,setFilter]=useState(''),[novelQuery,setNovelQuery]=useState(''),[matches,setMatches]=useState<{plugin:Plugin,novel:any}[]>([]),[scan,setScan]=useState<{plugin:Plugin,status:string}[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[installed,setInstalled]=useState<Record<string,Plugin>>(()=>{try{return JSON.parse(localStorage.getItem('installedSources')||'{}')}catch{return {}}})
 // Navigation: every page change goes through setPage so we can keep a back
 // stack, remember the last page per mode and reset scroll.
 // Language (re-renders the whole tree; strings are looked up at render time).
 const[lang,setLangState]=useState<Lang>(getLang())
 const changeLang=(l:Lang)=>{setLang(l);setLangState(l)}
 const navStack=useRef<{mode:Mode,page:string}[]>([]),modeRef=useRef(mode),pageRef=useRef(page)
 modeRef.current=mode;pageRef.current=page
 const[collapsed,setCollapsed]=useState(()=>lsGet('sidebarCollapsed')==='1'),[showKeys,setShowKeys]=useState(false)
 const setPage=(next:string)=>{if(next===pageRef.current)return;navStack.current.push({mode:modeRef.current,page:pageRef.current});if(navStack.current.length>50)navStack.current.shift();setPageState(next)}
 const switchMode=(m:Mode)=>{if(m===modeRef.current){setPage(startPage(m));return}navStack.current.push({mode:modeRef.current,page:pageRef.current});setModeState(m);lsSet('mode',m);setPageState(startPage(m))}
 const goBack=()=>{const prev=navStack.current.pop();if(!prev)return;if(prev.mode!==modeRef.current){setModeState(prev.mode);lsSet('mode',prev.mode)}setPageState(prev.page)}
 const toggleSidebar=()=>setCollapsed(c=>{lsSet('sidebarCollapsed',c?'0':'1');return !c})
 useEffect(()=>{if(isTopPage(mode,page))lsSet('lastPage:'+mode,page);document.title=pageLabel(mode,page)+' · NovelReader';if(page!=='reader')window.scrollTo({top:0})},[mode,page,lang])
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{
   const typing=isTyping(e.target),ctrl=e.ctrlKey||e.metaKey
   if(e.key==='Escape'){if(showKeysRef.current){setShowKeys(false);e.preventDefault()}else if(typing)(e.target as HTMLElement).blur();return}
   if(ctrl&&!e.altKey&&/^[1-4]$/.test(e.key)){e.preventDefault();switchModeRef.current(MODES[Number(e.key)-1]);return}
   if(ctrl&&e.key.toLowerCase()==='k'){if(focusPageSearch())e.preventDefault();return}
   if(ctrl&&e.key.toLowerCase()==='b'){e.preventDefault();toggleSidebar();return}
   if(e.altKey&&e.key==='ArrowLeft'&&!typing){e.preventDefault();goBackRef.current();return}
   if(typing||ctrl||e.altKey)return
   if(e.key==='/'){if(focusPageSearch())e.preventDefault()}
   else if(e.key==='?'){e.preventDefault();setShowKeys(v=>!v)}
  }
  const onMouse=(e:MouseEvent)=>{if(e.button===3){e.preventDefault();goBackRef.current()}}
  window.addEventListener('keydown',onKey);window.addEventListener('mouseup',onMouse)
  return()=>{window.removeEventListener('keydown',onKey);window.removeEventListener('mouseup',onMouse)}
 },[])
 const showKeysRef=useRef(showKeys),switchModeRef=useRef(switchMode),goBackRef=useRef(goBack)
 showKeysRef.current=showKeys;switchModeRef.current=switchMode;goBackRef.current=goBack
 // Reader: preferences, auto-hiding toolbar, progress, exact resume position.
 const[readerPrefs,setReaderPrefs]=useState<ReaderPrefs>(loadReaderPrefs),[readerSettingsOpen,setReaderSettingsOpen]=useState(false),[readerBarHidden,setReaderBarHidden]=useState(false),[readProgress,setReadProgress]=useState(0)
 const updateReaderPrefs=(patch:Partial<ReaderPrefs>)=>setReaderPrefs(prev=>{const next={...prev,...patch};lsSet('readerPrefs',JSON.stringify(next));return next})
 const pendingScrollRef=useRef(0),ignoreScrollUntil=useRef(0),moveChapterRef=useRef<(d:number)=>void>(()=>{}),readerRef=useRef<any>(null)
 useEffect(()=>{
  if(page!=='reader')return
  let lastY=window.scrollY,saveTimer:any=null
  const onScroll=()=>{const y=window.scrollY,max=document.documentElement.scrollHeight-window.innerHeight;const ratio=max>0?clamp(y/max,0,1):1;setReadProgress(ratio)
   if(Date.now()<ignoreScrollUntil.current){lastY=y}else if(Math.abs(y-lastY)>6){setReaderBarHidden(y>lastY&&y>140);lastY=y}
   clearTimeout(saveTimer);saveTimer=setTimeout(()=>{const r=readerRef.current;if(!r)return;try{const key='reading:'+r.novel.id;const cur=JSON.parse(localStorage.getItem(key)||'{}')||{};if(cur.index===r.index)localStorage.setItem(key,JSON.stringify({...cur,scroll:Math.round(ratio*1000)/1000}))}catch{}},400)}
  const onKey=(e:KeyboardEvent)=>{if(isTyping(e.target)||e.ctrlKey||e.metaKey||e.altKey)return
   if(e.key==='ArrowRight'){e.preventDefault();moveChapterRef.current(1)}
   else if(e.key==='ArrowLeft'){e.preventDefault();moveChapterRef.current(-1)}
   else if(e.key==='+'||e.key==='='){e.preventDefault();setReaderPrefs(p=>{const n={...p,size:clamp(p.size+1,14,32)};lsSet('readerPrefs',JSON.stringify(n));return n})}
   else if(e.key==='-'||e.key==='_'){e.preventDefault();setReaderPrefs(p=>{const n={...p,size:clamp(p.size-1,14,32)};lsSet('readerPrefs',JSON.stringify(n));return n})}
   else if(e.key==='Escape')setReaderSettingsOpen(false)}
  window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('keydown',onKey);onScroll()
  return()=>{window.removeEventListener('scroll',onScroll);window.removeEventListener('keydown',onKey);clearTimeout(saveTimer)}
 },[page])
 useEffect(()=>{readerRef.current=reader;if(page!=='reader'||!reader)return;setReaderBarHidden(false);const ratio=pendingScrollRef.current;pendingScrollRef.current=0
  ignoreScrollUntil.current=Date.now()+400;requestAnimationFrame(()=>{const max=document.documentElement.scrollHeight-window.innerHeight;window.scrollTo({top:ratio>0?ratio*max:0})})},[page,reader?.novel?.id,reader?.index])
 // Automatic backups: shortly after any library change, and every 15 minutes.
 useEffect(()=>{const tm=setTimeout(()=>{window.novelReader.backupAuto?.(collectBackup()).catch(()=>{})},8000);return()=>clearTimeout(tm)},[library])
 useEffect(()=>{const iv=setInterval(()=>{window.novelReader.backupAuto?.(collectBackup()).catch(()=>{})},15*60*1000);return()=>clearInterval(iv)},[])
 // New chapter checks: re-read each novel's chapter list from its source.
 const[updateState,setUpdateState]=useState<UpdateState>({running:false,done:0,total:0,found:0,failed:0,at:Number(lsGet('lastUpdateCheck'))||0})
 const libraryRef=useRef<any[]>([]),checkingRef=useRef(false)
 libraryRef.current=library
 const checkUpdates=async()=>{
  if(checkingRef.current)return
  const list=libraryRef.current.filter(n=>n&&n.source&&n.path);if(!list.length)return
  checkingRef.current=true
  let done=0,found=0,failed=0;const updates:Record<string,any>={},queue=[...list]
  setUpdateState({running:true,done,total:list.length,found,failed,at:updateState.at})
  const worker=async()=>{while(queue.length){const n=queue.shift()!
   try{const detail:any=await Promise.race([window.novelReader.parseNovel(n.source,n.path),new Promise((_,rej)=>setTimeout(()=>rej(Error('timeout')),30000))])
    const chs=Array.isArray(detail?.chapters)?detail.chapters:[],old=n.chapters?.length||Number(n.chapterCount)||0
    if(chs.length>old){updates[n.id]={chapters:chs,chapterCount:chs.length,newChapters:(Number(n.newChapters)||0)+(chs.length-old),checkedAt:Date.now()};found++}
    else updates[n.id]={checkedAt:Date.now()}
   }catch{failed++}
   done++;setUpdateState(st=>({...st,done,found,failed}))}}
  try{await Promise.all([worker(),worker(),worker()])}finally{
   setLibrary(prev=>{const next=prev.map(x=>updates[x.id]?{...x,...updates[x.id]}:x);lsSet('library',JSON.stringify(next));return next})
   const at=Date.now();lsSet('lastUpdateCheck',String(at));setUpdateState({running:false,done,total:list.length,found,failed,at});checkingRef.current=false}
 }
 useEffect(()=>{const last=Number(lsGet('lastUpdateCheck'))||0;if(lsGet('autoCheckUpdates')==='0'||Date.now()-last<12*3600*1000||!libraryRef.current.length)return;const tm=setTimeout(()=>{checkUpdates()},4000);return()=>clearTimeout(tm)},[])
 // Welcome guide: first launch only (existing users with a library skip it).
 const[showWelcome,setShowWelcome]=useState(()=>{if(lsGet('onboarded'))return false;try{if(JSON.parse(localStorage.getItem('library')||'[]').length){lsSet('onboarded','1');return false}}catch{}return true})
 const closeWelcome=()=>{lsSet('onboarded','1');setShowWelcome(false)}
 // Read aloud panel in the reader.
 const[ttsOpen,setTtsOpen]=useState(false),readerArticleRef=useRef<HTMLElement>(null)
 useEffect(()=>{if(page!=='reader')setTtsOpen(false)},[page])
 const clearNew=(n:any)=>{if(!n?.newChapters)return;setLibrary(prev=>{const next=prev.map(x=>x.id===n.id?{...x,newChapters:0}:x);lsSet('library',JSON.stringify(next));return next})}
 const ensurePlugins=async():Promise<Plugin[]>=>{if(plugins.length)return plugins;const r=await fetch(MANIFEST);if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();const list=Array.isArray(j)?j:(j.plugins||[]);setPlugins(list);return list};const load=async()=>{setLoading(true);setError('');try{const r=await fetch(MANIFEST);if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();setPlugins(Array.isArray(j)?j:(j.plugins||[]))}catch(e){setError(String(e))}finally{setLoading(false)}}
 useEffect(()=>{if(page==='sources'&&!plugins.length)load()},[page]);const save=(x:Record<string,Plugin>)=>{setInstalled(x);localStorage.setItem('installedSources',JSON.stringify(x))};const install=async(p:Plugin)=>{try{const r=await fetch(p.url);if(!r.ok)throw Error('Plugin HTTP '+r.status);const code=await r.text();if(!code||code.length<50)throw Error('Invalid plugin bundle');const x={...installed,[p.id]:p};localStorage.setItem('plugin:'+p.id,code);save(x)}catch(e){setError('Install '+p.name+': '+String(e))}};const uninstall=(p:Plugin)=>{const x={...installed};delete x[p.id];localStorage.removeItem('plugin:'+p.id);save(x)}
 const shown=plugins.filter(p=>(p.name+' '+p.lang).toLowerCase().includes(filter.toLowerCase()));const discover=async()=>{const q=novelQuery.trim();if(!q)return;setError('');setMatches([]);let pool=plugins;if(!pool.length){try{const r=await fetch(MANIFEST);const j=await r.json();pool=Array.isArray(j)?j:(j.plugins||[]);setPlugins(pool)}catch(e){setError(String(e));return}}setScan(pool.map(plugin=>({plugin,status:'queued'})));const found:{plugin:Plugin,novel:any}[]=[];const batch=6;for(let i=0;i<pool.length;i+=batch){const part=pool.slice(i,i+batch);setScan(x=>x.map(r=>part.some(p=>p.id===r.plugin.id)?{...r,status:'checking'}:r));await Promise.all(part.map(async plugin=>{try{const results=await window.novelReader.searchPlugin(plugin,q);const exact=results.filter((n:any)=>n.name?.toLowerCase().includes(q.toLowerCase()));if(exact.length){exact.forEach((novel:any)=>found.push({plugin,novel}));setMatches([...found]);setScan(x=>x.map(v=>v.plugin.id===plugin.id?{...v,status:'found'}:v))}else setScan(x=>x.map(v=>v.plugin.id===plugin.id?{...v,status:'no-match'}:v))}catch{setScan(x=>x.map(v=>v.plugin.id===plugin.id?{...v,status:'error'}:v))}}))}};const choose=async(m:{plugin:Plugin,novel:any})=>{await install(m.plugin);const detail=await window.novelReader.parseNovel(m.plugin,m.novel.path);const item={id:m.plugin.id+':'+m.novel.path,name:detail.name||m.novel.name,cover:detail.cover||m.novel.cover||'',author:detail.author||'',path:m.novel.path,source:m.plugin,chapterCount:detail.chapters?.length||0,chapters:detail.chapters||[],addedAt:Date.now()};const next=[item,...library.filter(x=>x.id!==item.id)];setLibrary(next);localStorage.setItem('library',JSON.stringify(next));return item};
;const openChapter=async(n:any,c:any,i:number)=>{setReaderLoading(true);setError('');try{const d=await window.novelReader.parseChapter(n.source,c.path||c.url);const content=typeof d==='string'?d:(d?.text||d?.content||d?.html||d?.body||'');if(!String(content).trim())throw Error('The source returned an empty chapter');setReader({novel:n,chapter:c,index:i,content});localStorage.setItem('reading:'+n.id,JSON.stringify({index:i,path:c.path||c.url,at:Date.now()}));setPage('reader')}catch(e){setError(t('Could not load chapter:')+' '+String(e))}finally{setReaderLoading(false)}};const moveChapter=async(delta:number)=>{if(!reader||readerLoading)return;const i=reader.index+delta;if(i<0||i>=reader.novel.chapters.length)return;await openChapter(reader.novel,reader.novel.chapters[i],i)};const removeNovel=(n:any)=>{if(!confirm('Remove “'+n.name+'” from your Library?'))return;const next=library.filter(x=>x.id!==n.id);setLibrary(next);localStorage.setItem('library',JSON.stringify(next));localStorage.removeItem('reading:'+n.id)};const resumeNovel=(n:any)=>{setSelectedNovel(n);setChapterFilter('');try{const saved=JSON.parse(localStorage.getItem('reading:'+n.id)||'null');if(saved&&Number.isInteger(saved.index)&&n.chapters?.[saved.index]){pendingScrollRef.current=Number(saved.scroll)||0;openChapter(n,n.chapters[saved.index],saved.index);return}}catch{}setPage('novel')};
const playAnimeEpisode=async(ep:any)=>{if(!selectedAnime)return;setAnimeVideoLoading(true);setAnimeNotice(null);setSelectedEpisode(ep);setAnimeVideos([]);setSelectedVideo(null);try{
 const episodeNumber=String(ep.number||String(ep.name||ep.title||'').match(/\d+(?:\.\d+)?/)?.[0]||'');
 const candidates=[{sourceId:String(selectedAnime.sourceId||''),sourceName:selectedAnime.sourceName||selectedAnime.source||'Current source',url:selectedAnime.url||selectedAnime.path,episode:ep},...((selectedAnime.alternates||[]) as any[]).map((x:any)=>({...x,episode:null}))];
 let lastError:any=null;
 for(const candidate of candidates){
  try{
   if(!candidate.sourceId)continue;
   let targetEp=candidate.episode;
   if(!targetEp&&candidate.url){
    const epData=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(candidate.sourceId)+'/episodes?url='+encodeURIComponent(candidate.url));
    const eps=Array.isArray(epData)?epData:(epData.episodes||epData.items||epData.list||[]);
    targetEp=eps.find((x:any)=>String(x.number||String(x.name||x.title||'').match(/\d+(?:\.\d+)?/)?.[0]||'')===episodeNumber);
   }
   const episodeUrl=targetEp&&(targetEp.url||targetEp.path);
   if(!episodeUrl)continue;
   const data=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(candidate.sourceId)+'/videos?url='+encodeURIComponent(episodeUrl));
   const videos=Array.isArray(data)?data:(data.videos||data.items||data.list||[]);
   const normalized=[] as any[];const preferred=videos.find((v:any)=>v.preferred)||videos[0];for(const v of videos){const raw=v.videoUrl||v.url||v.link||'';const headers=v.headers||{};const lower=String(raw).toLowerCase();let stream='';let torrentSessionId='';if(/^https?:\/\//i.test(String(raw))){const headerText=Object.entries(headers).map(([k,val])=>k+': '+String(val)).join('\n');const qs='sourceId='+encodeURIComponent(candidate.sourceId)+'&url='+encodeURIComponent(raw)+'&headers='+encodeURIComponent(headerText);const route=lower.includes('.m3u8')?'hls':lower.includes('.mpd')?'dash':'proxy';stream='http://127.0.0.1:4567/api/v1/'+route+'?'+qs}else if(/^magnet:\?/i.test(String(raw))&&v===preferred){try{const info=await window.novelReader.torrentStartMagnet(String(raw));stream=info.streamUrl;torrentSessionId=info.sessionId}catch(e){lastError=e}}if(stream)normalized.push({...v,streamUrl:stream,torrentSessionId,sourceName:candidate.sourceName,unsupportedScheme:''})}
   if(normalized.length){setAnimeVideos(normalized);setSelectedVideo(normalized.find((v:any)=>v.preferred)||normalized[0]);if(candidate.sourceId!==String(selectedAnime.sourceId||''))setAnimeNotice({ok:true,scope:'detail',text:'Primary source failed. Playing from '+candidate.sourceName+'.'});return}
   lastError=Error('no playable streams from '+candidate.sourceName);
  }catch(e){lastError=e}
 }
 // Saved alternates can become stale as extensions/sites change. Refresh the
 // global search once and try matching sources that were not in the saved set.
 try{
  const query=encodeURIComponent(String(selectedAnime.name||selectedAnime.title||''));
  const sourcesData=await window.novelReader.miwayomiFetch('/api/v1/sources');
  const rawSources=Array.isArray(sourcesData)?sourcesData:(sourcesData.sources||sourcesData.items||sourcesData.anime||[]);
  const sources=Array.isArray(rawSources)?rawSources:[];
  const seen=new Set(candidates.map((x:any)=>String(x.sourceId||'')));
  for(const src of sources){
   const sid=String(src.id||src.sourceId||'');if(!sid||seen.has(sid))continue;
   seen.add(sid);
   try{
    const foundData=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(sid)+'/search?query='+query+'&page=1');
    const found=Array.isArray(foundData)?foundData:(foundData.animes||foundData.items||foundData.results||[]);
    const title=String(selectedAnime.name||selectedAnime.title||'').trim().toLowerCase();
    const normTitle=(v:any)=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const wanted=normTitle(title);
    const ranked=found.map((x:any)=>{const got=normTitle(x.title||x.name||'');let score=0;if(got===wanted)score=100;else if(got.startsWith(wanted+' ')||wanted.startsWith(got+' '))score=80;else if(got.includes(wanted)||wanted.includes(got))score=60;return{x,score}}).filter((r:any)=>r.score>0).sort((a:any,b:any)=>b.score-a.score);
    const hit=ranked[0]?.x;if(!hit)continue;
    const animeUrl=hit.url||hit.path;if(!animeUrl)continue;
    const epData=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(sid)+'/episodes?url='+encodeURIComponent(animeUrl));
    const eps=Array.isArray(epData)?epData:(epData.episodes||epData.items||epData.list||[]);
    const targetEp=eps.find((x:any)=>String(x.number||String(x.name||x.title||'').match(/\d+(?:\.\d+)?/)?.[0]||'')===episodeNumber);
    const episodeUrl=targetEp&&(targetEp.url||targetEp.path);if(!episodeUrl)continue;
    const data=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(sid)+'/videos?url='+encodeURIComponent(episodeUrl));
    const videos=Array.isArray(data)?data:(data.videos||data.items||data.list||[]);
    const normalized=[] as any[];const preferred=videos.find((v:any)=>v.preferred)||videos[0];for(const v of videos){const raw=v.videoUrl||v.url||v.link||'';const headers=v.headers||{};const lower=String(raw).toLowerCase();let stream='';let torrentSessionId='';if(/^https?:\/\//i.test(String(raw))){const headerText=Object.entries(headers).map(([k,val])=>k+': '+String(val)).join('\n');const qs='sourceId='+encodeURIComponent(sid)+'&url='+encodeURIComponent(raw)+'&headers='+encodeURIComponent(headerText);const route=lower.includes('.m3u8')?'hls':lower.includes('.mpd')?'dash':'proxy';stream='http://127.0.0.1:4567/api/v1/'+route+'?'+qs}else if(/^magnet:\?/i.test(String(raw))&&v===preferred){try{const info=await window.novelReader.torrentStartMagnet(String(raw));stream=info.streamUrl;torrentSessionId=info.sessionId}catch(e){lastError=e}}if(stream)normalized.push({...v,streamUrl:stream,torrentSessionId,sourceName:src.name||'alternate source'})}
    if(normalized.length){setAnimeVideos(normalized);setSelectedVideo(normalized.find((v:any)=>v.preferred)||normalized[0]);setAnimeNotice({ok:true,scope:'detail',text:'Saved sources failed. Playing from '+(src.name||'a refreshed source')+'.'});return}
   }catch(e){lastError=e}
  }
 }catch(e){lastError=e}
 throw Error('No playable HTTP/HLS/torrent stream was found for episode '+episodeNumber+' after checking '+candidates.length+' saved source(s) and the currently loaded sources. Some extensions returned torrent/magnet links or extractor errors. Open Sources diagnostics for technical details.')
}catch(e:any){setAnimeNotice({ok:false,scope:'detail',text:'Could not load video: '+(e.message||String(e))})}finally{setAnimeVideoLoading(false)}};
const openAnime=async(a:any)=>{setAnimeDetailLoading(true);setAnimeNotice(null);try{const sourceId=String(a.sourceId??a.source?.id??'');const url=a.url||a.path;if(!sourceId||!url)throw Error('Saved anime is missing its source ID or URL');const detail=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(sourceId)+'/details?url='+encodeURIComponent(url));const epData=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(sourceId)+'/episodes?url='+encodeURIComponent(url));const episodes=Array.isArray(epData)?epData:(epData.episodes||epData.items||epData.list||[]);const item={...a,...detail,id:a.id||url,name:detail?.title||detail?.name||a.name||a.title,sourceId,url,episodes,episodeCount:episodes.length};setSelectedAnime(item);const next=animeLibrary.map(x=>x.id===a.id?{...x,episodes:episodes.length}:x);setAnimeLibrary(next);localStorage.setItem('animeLibrary',JSON.stringify(next));setPage('animeDetail')}catch(e:any){setAnimeNotice({ok:false,scope:'library',text:'Could not open anime: '+(e.message||String(e))})}finally{setAnimeDetailLoading(false)}};
const installAnimeSource=async(src:any)=>{setAnimeNotice(null);try{const pkg=src.pkg||src.package||src.packageName;const already=await window.novelReader.miwayomiFetch('/api/v1/extensions/installed');const installedList=Array.isArray(already)?already:(already.extensions||already.items||[]);const existing=installedList.find((x:any)=>[x.pkg,x.package,x.packageName].includes(pkg)||String(x.name||'')===String(src.name||''));if(existing){localStorage.setItem('selectedAnimeSource',JSON.stringify(src));setSelectedAnimeSource(src);setAnimeNotice({ok:true,scope:'sources',text:(src.name||pkg)+' is already installed. Using the existing extension.'});return}const st=await window.novelReader.miwayomiStatus();setAnimeEngine(st);if(!st.online)throw Error('Anime engine is not ready');const repoUrl=animeRepoUrl;const repoData=await window.novelReader.miwayomiFetch('/api/v1/extensions/repo?url='+encodeURIComponent(repoUrl));const list=Array.isArray(repoData)?repoData:(repoData.extensions||repoData.plugins||repoData.items||[]);const hit=list.find((x:any)=>(pkg&&[x.pkg,x.package,x.packageName].includes(pkg))||String(x.name||'')===String(src.name||''));if(!hit)throw Error('Extension not found in Miwayomi repository index');const apk=hit.apk||hit.apkName||hit.file||hit.url;if(!apk)throw Error('Repository entry has no APK filename');await window.novelReader.miwayomiFetch('/api/v1/extensions/repos','POST',{repos:[repoUrl]});await window.novelReader.miwayomiFetch('/api/v1/extensions/install','POST',{repoUrl,apk});const installed=await window.novelReader.miwayomiFetch('/api/v1/extensions/installed');const installedList2=Array.isArray(installed)?installed:(installed.extensions||installed.items||[]);const registered=installedList2.find((x:any)=>[x.pkg,x.package,x.packageName].includes(pkg)||String(x.name||'')===String(src.name||''));if(!registered)throw Error('Miwayomi did not register the extension after install');if(Number(registered.anime??registered.sourceCount??0)<=0)throw Error((src.name||pkg)+' installed, but Miwayomi loaded 0 Anime sources from this extension.');localStorage.setItem('selectedAnimeSource',JSON.stringify(src));setSelectedAnimeSource(src);setAnimeNotice({ok:true,scope:'sources',text:(src.name||pkg)+' installed and registered in the Anime engine.'})}catch(e:any){setAnimeNotice({ok:false,scope:'sources',text:'Could not install source: '+e.message})}}; moveChapterRef.current=(d:number)=>{moveChapter(d)}
 const removeFromLibrary=(n:any):Removed=>{const position=library.findIndex(x=>x.id===n.id);const reading=lsGet('reading:'+n.id);const next=library.filter(x=>x.id!==n.id);setLibrary(next);lsSet('library',JSON.stringify(next));try{localStorage.removeItem('reading:'+n.id)}catch{}return{novel:n,position,reading}}
 const restoreToLibrary=(r:Removed)=>{setLibrary(prev=>{if(prev.some(x=>x.id===r.novel.id))return prev;const next=[...prev];next.splice(r.position<0?0:Math.min(r.position,next.length),0,r.novel);lsSet('library',JSON.stringify(next));return next});if(r.reading)lsSet('reading:'+r.novel.id,r.reading)}
 return <div className={"app"+(collapsed?" collapsed":"")}><Sidebar mode={mode} page={page} collapsed={collapsed} onMode={switchMode} onPage={setPage} onToggle={toggleSidebar} onHelp={()=>setShowKeys(true)}/><main id="main"><ErrorBoundary resetKey={mode+':'+page} onHome={()=>{setModeState('books');lsSet('mode','books');setPageState('library')}}>
 {page==='movies'&&<><header><div><h1>Movie Library</h1><p>{movieLibrary.length} movie{movieLibrary.length===1?'':'s'} saved locally.</p></div></header>{movieLibrary.length===0?<section className="panel"><h2>Your Movie Library is empty</h2><p>Use Global Search to find a movie and add it to your library.</p></section>:<section className="animegrid">{movieLibrary.map((a:any)=><article className="animecard" key={a.id}>{(a.thumbnail||a.cover)&&<img src={a.thumbnail||a.cover}/>}<h3>{a.name||a.title}</h3><small>{a.sourceName||'Movie source'}</small></article>)}</section>}</>}
 {page==='movieSearch'&&<><header><div><h1>Movies</h1><p>Search movies across the compatible video sources already loaded in NovelReader.</p></div></header><div className="searchbar"><input placeholder="Search movies, e.g. Interstellar…" value={movieQuery} onChange={e=>setMovieQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&movieQuery.trim()&&!movieSearching)(e.currentTarget.nextElementSibling as HTMLButtonElement|null)?.click()}}/><button className="primary" disabled={!movieQuery.trim()||movieSearching} onClick={async()=>{setMovieSearching(true);setMovieResults([]);try{const sr=await window.novelReader.miwayomiFetch('/api/v1/sources');const sources=Array.isArray(sr)?sr:(sr.anime||sr.sources||sr.items||[]);const settled=await Promise.allSettled(sources.filter((x:any)=>x&&x.id!=null).map(async(src:any)=>{try{const id=String(src.id);const d=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(id)+'/search?query='+encodeURIComponent(movieQuery)+'&page=1');const rows=Array.isArray(d)?d:(d.animes||d.results||d.items||d.list||[]);return rows.map((a:any)=>({...a,sourceId:id,sourceName:src.name||id}))}catch{return[]}}));const rows=settled.flatMap((r:any)=>r.status==='fulfilled'?r.value:[]);const norm=(v:any)=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();const q=norm(movieQuery);const ranked=rows.map((a:any)=>{const t=norm(a.title||a.name||'');const score=t===q?100:t.startsWith(q+' ')?90:t.includes(q)?80:q.split(' ').filter(Boolean).every(w=>t.includes(w))?60:0;return{a,score}}).filter((x:any)=>x.score>0).sort((a:any,b:any)=>b.score-a.score);const seen=new Set<string>();setMovieResults(ranked.filter((x:any)=>{const k=norm(x.a.title||x.a.name||'');if(seen.has(k))return false;seen.add(k);return true}).map((x:any)=>x.a))}finally{setMovieSearching(false)}}}>{movieSearching?'Searching…':'Search movies'}</button></div>{movieResults.length>0&&<section className="panel anime-results"><h2>Search results</h2><div className="animegrid">{movieResults.map((a:any,i:number)=><article className="animecard" key={(a.url||a.title||'movie')+i}>{(a.thumbnail||a.cover)&&<img src={a.thumbnail||a.cover}/>}<h3>{a.title||a.name||'Untitled'}</h3><small>{a.sourceName||'Movie source'}</small><button className="primary" onClick={()=>{const item={...a,id:'movie:'+(a.sourceId||'')+':'+(a.url||a.path||Date.now()),name:a.title||a.name};const next=[item,...movieLibrary.filter((x:any)=>x.id!==item.id)];setMovieLibrary(next);localStorage.setItem('movieLibrary',JSON.stringify(next));setPage('movies')}}>Add to library</button></article>)}</div></section>}</>}
 {page==='series'&&<><header><div><h1>Series Library</h1><p>{seriesLibrary.length} series saved locally.</p></div></header>{seriesLibrary.length===0?<section className="panel"><h2>Your Series Library is empty</h2><p>Use Global Search to find a series and add it to your library.</p></section>:<section className="animegrid">{seriesLibrary.map((a:any)=><article className="animecard" key={a.id}>{(a.thumbnail||a.cover)&&<img src={a.thumbnail||a.cover}/>}<h3>{a.name||a.title}</h3><small>{a.sourceName||a.source||'Series source'}</small><button className="primary" disabled={seriesLoading} onClick={async()=>{setSeriesLoading(true);try{const sid=String(a.sourceId||'');const url=a.url||a.path;if(!sid||!url)throw Error('Series source is missing');let detail:any={};try{detail=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(sid)+'/details?url='+encodeURIComponent(url))}catch(e){console.warn('[series] details unavailable, continuing with search result',e)}let epData:any=null;let usedUrl=url;let epErr:any=null;const episodeUrls=[url,detail?.url,a.path].filter((v:any,i:number,x:any[])=>v&&x.indexOf(v)===i);for(const candidate of episodeUrls){try{epData=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(sid)+'/episodes?url='+encodeURIComponent(candidate));usedUrl=candidate;break}catch(e){epErr=e}}if(!epData)throw epErr||Error('No episode list returned by this source');const episodes=Array.isArray(epData)?epData:(epData.episodes||epData.items||epData.list||[]);setSelectedSeries({...a,...detail,url:usedUrl,name:detail?.title||detail?.name||a.name||a.title,episodes});setPage('seriesDetail')}catch(e:any){alert('Could not open series: '+(e.message||String(e)))}finally{setSeriesLoading(false)}}}>Open series</button></article>)}</section>}</>}
 {page==='seriesDetail'&&selectedSeries&&<><header><div><button className="backbtn" onClick={()=>setPage('series')}>← Series Library</button><h1>{selectedSeries.name||selectedSeries.title}</h1><p>{selectedSeries.sourceName||'Series'} · {selectedSeries.episodes?.length||0} episodes</p></div></header><section className="panel"><h2>Episodes</h2>{!selectedSeries.episodes?.length?<p>No episodes returned by this source.</p>:<div className="episodegrid">{selectedSeries.episodes.map((ep:any,i:number)=>{const label=ep.name||ep.title||('Episode '+(ep.number||i+1));return <button className="episodecard" key={(ep.url||ep.path||ep.name||'series-ep')+i} onClick={()=>{setSelectedAnime({...selectedSeries,sourceId:selectedSeries.sourceId,url:selectedSeries.url||selectedSeries.path});playAnimeEpisode(ep)}}><span className="episodebadge">{ep.number||String(label).match(/\d+(?:\.\d+)?/)?.[0]||'#'}</span><span className="episodetitle">{label}</span><span className="episodeplay">▶</span></button>})}</div>}{selectedEpisode&&<div className="anime-player"><h2>{selectedEpisode.name||selectedEpisode.title||'Episode'}</h2>{animeVideoLoading?<p>Extracting video streams…</p>:selectedVideo?<AnimeVideo key={selectedVideo.streamUrl} video={selectedVideo}/>:null}</div>}</section></>}
 {page==='seriesSearch'&&<><header><div><h1>Series</h1><p>Search TV series across the compatible video sources already loaded in NovelReader.</p></div></header><div className="searchbar"><input placeholder="Search series, e.g. Breaking Bad…" value={seriesQuery} onChange={e=>setSeriesQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&seriesQuery.trim()&&!seriesSearching){const b=e.currentTarget.nextElementSibling as HTMLButtonElement|null;b?.click()}}}/><button className="primary" disabled={!seriesQuery.trim()||seriesSearching} onClick={async()=>{setSeriesSearching(true);setSeriesResults([]);try{const sr=await window.novelReader.miwayomiFetch('/api/v1/sources');const sources=Array.isArray(sr)?sr:(sr.anime||sr.sources||sr.items||[]);const settled=await Promise.allSettled(sources.filter((x:any)=>x&&x.id!=null).map(async(src:any)=>{try{const id=String(src.id);const d=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(id)+'/search?query='+encodeURIComponent(seriesQuery)+'&page=1');const rows=Array.isArray(d)?d:(d.animes||d.results||d.items||d.list||[]);return rows.map((a:any)=>({...a,sourceId:id,sourceName:src.name||id}))}catch{return[]}}));const rows=settled.flatMap((r:any)=>r.status==='fulfilled'?r.value:[]);const norm=(v:any)=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();const q=norm(seriesQuery);const ranked=rows.map((a:any)=>{const t=norm(a.title||a.name||'');let score=t===q?100:t.startsWith(q+' ')?90:t.includes(q)?80:q.split(' ').filter(Boolean).every(w=>t.includes(w))?60:0;return{a,score}}).filter((x:any)=>x.score>0).sort((a:any,b:any)=>b.score-a.score);const seen=new Set<string>();setSeriesResults(ranked.filter((x:any)=>{const k=norm(x.a.title||x.a.name||'');if(seen.has(k))return false;seen.add(k);return true}).map((x:any)=>x.a))}finally{setSeriesSearching(false)}}}>{seriesSearching?'Searching…':'Search series'}</button></div>{seriesResults.length>0&&<section className="panel anime-results"><h2>Search results</h2><div className="animegrid">{seriesResults.map((a:any,i:number)=><article className="animecard" key={(a.url||a.title||'series')+i}>{(a.thumbnail||a.cover)&&<img src={a.thumbnail||a.cover}/>}<h3>{a.title||a.name||'Untitled'}</h3><small>{a.sourceName||'Series source'}</small><button className="primary" onClick={()=>{const item={...a,id:'series:'+(a.sourceId||'')+':'+(a.url||a.path||Date.now()),name:a.title||a.name};const next=[item,...seriesLibrary.filter((x:any)=>x.id!==item.id)];setSeriesLibrary(next);localStorage.setItem('seriesLibrary',JSON.stringify(next));setPage('series')}}>Add to library</button></article>)}</div></section>}</>}
 {page==='library'&&<NovelLibrary library={library} updates={updateState} onCheckUpdates={checkUpdates} onOpen={(n:any)=>{clearNew(n);resumeNovel(n)}} onDetails={(n:any)=>{clearNew(n);setSelectedNovel(n);setChapterFilter('');setPage('novel')}} onRemove={removeFromLibrary} onRestore={restoreToLibrary} onSearch={()=>setPage('search')}/>}
 {page==='novel'&&selectedNovel&&<NovelDetail novel={selectedNovel} filter={chapterFilter} setFilter={setChapterFilter} loading={readerLoading} onBack={()=>setPage('library')} onOpenChapter={(c,i)=>openChapter(selectedNovel,c,i)} onContinue={()=>resumeNovel(selectedNovel)}/>}
 {page==='reader'&&reader&&(()=>{const total=reader.novel.chapters.length,title=reader.chapter.name||reader.chapter.title||t('Chapter {n}',{n:reader.index+1}),first=reader.index===0,last=reader.index>=total-1
 return <section className={'readerpage rtheme-'+readerPrefs.theme} style={{'--r-size':readerPrefs.size+'px','--r-leading':String(readerPrefs.leading),'--r-width':READER_WIDTHS[readerPrefs.width],'--r-font':READER_FONTS[readerPrefs.font]} as React.CSSProperties}>
  <div className={'readerbar'+(readerBarHidden&&!readerSettingsOpen?' hidden':'')}>
   <button className="backbtn" onClick={()=>setPage('novel')}>← {t('Chapters')}</button>
   <div className="readerbar-title"><b>{reader.novel.name}</b><small>{title}</small></div>
   <div className="readertools"><button className={'themebtn tts-toggle'+(ttsOpen?' on':'')} aria-pressed={ttsOpen} title={t('Read aloud')} aria-label={t('Read aloud')} onClick={()=>setTtsOpen(o=>!o)}>🔊</button><span className="readerpos" title={t('Chapter position')}>{reader.index+1} / {total}</span><button className="themebtn readersettings-btn" aria-expanded={readerSettingsOpen} title={t('Reading settings')} onClick={()=>setReaderSettingsOpen(o=>!o)}>Aa</button></div>
   <div className="readprogress" aria-hidden="true"><span style={{width:(readProgress*100).toFixed(1)+'%'}}/></div>
   {readerSettingsOpen&&<ReaderSettings prefs={readerPrefs} onChange={updateReaderPrefs} onClose={()=>setReaderSettingsOpen(false)}/>}
  </div>
  <article className="readercontent" ref={readerArticleRef}><h1>{title}</h1><div dangerouslySetInnerHTML={chapterHtml(reader.content)} /></article>
  {ttsOpen&&<ReaderTTS rootRef={readerArticleRef} chapterKey={reader.novel.id+':'+reader.index} hasNext={!last} onNext={()=>moveChapter(1)} onClose={()=>setTtsOpen(false)}/>}
  <div className="readerend"><small>{t('End of chapter {n} of {total}',{n:reader.index+1,total})}</small></div>
  <div className="readernav"><button disabled={first||readerLoading} onClick={()=>moveChapter(-1)}>← {t('Previous')}</button><button className="readernext" disabled={last||readerLoading} onClick={()=>moveChapter(1)}>{readerLoading?t('Loading…'):last?t('Last chapter'):t('Next chapter')+' →'}</button></div>
 </section>})()}
 {page==='animeSearch'&&<><header><div><h1>Anime</h1><p>Search, follow and watch anime from compatible source extensions.</p></div></header><div className="searchbar"><input placeholder="Search anime, e.g. Solo Leveling…" value={animeQuery} onChange={e=>setAnimeQuery(e.target.value)}/><button className="primary" disabled={!animeQuery.trim()||animeSearching} onClick={async()=>{setAnimeSearching(true);setAnimeResults([]);setAnimeSearchLog([]);setAnimeNotice(null);const st=await window.novelReader.miwayomiStatus();setAnimeEngine(st);if(!st.online){setAnimeNotice({ok:false,scope:'search',text:'Anime engine is offline.'});setAnimeSearching(false);return}try{
const blocked=/hentai|jav|missav|xvideos|xnxx|myreadingmanga|torrent|debrid|nyaa|jable/i;
let catalog=animeSources;if(!catalog.length){const r=await fetch(animeRepoUrl);if(!r.ok)throw Error('Repository HTTP '+r.status);const data=await r.json();catalog=(Array.isArray(data)?data:(data.extensions||data.plugins||[])).filter((x:any)=>!blocked.test(String(x.name||x.pkg||'')));setAnimeSources(catalog)}
const installedRaw=await window.novelReader.miwayomiFetch('/api/v1/extensions/installed');const installed=Array.isArray(installedRaw)?installedRaw:(installedRaw.extensions||installedRaw.items||[]);
let sourcesRaw=await window.novelReader.miwayomiFetch('/api/v1/sources');let sources=Array.isArray(sourcesRaw)?sourcesRaw:(sourcesRaw.anime||sourcesRaw.sources||sourcesRaw.items||[]);
let usable=sources.filter((x:any)=>x&&x.id!=null);if(!usable.length){const candidates=catalog.filter((x:any)=>(String(x.lang||'').toLowerCase()==='en'||String(x.lang||'').toLowerCase()==='all')&&x.apk&&x.pkg&&!/google drive|jellyfin|stremio|newgrounds|torbox/i.test(String(x.name||x.pkg||''))).slice(0,12);setAnimeNotice({ok:true,scope:'search',text:'Probing '+candidates.length+' Anime sources for “'+animeQuery+'”…'});const found:any[]=[];for(const candidate of candidates){const key='probe:'+String(candidate.pkg||candidate.name);setAnimeSearchLog(x=>[...x.filter((v:any)=>v.id!==key),{id:key,name:candidate.name||candidate.pkg,status:'searching'}]);try{await installAnimeSource(candidate);const sr=await window.novelReader.miwayomiFetch('/api/v1/sources');const anime=Array.isArray(sr)?sr:(sr.anime||[]);const pkg=String(candidate.pkg||'').toLowerCase();const cleanName=String(candidate.name||'').replace(/^Aniyomi:\s*/,'').trim().toLowerCase();const loaded=anime.filter((x:any)=>{const sp=String(x.pkg||'').toLowerCase();const sn=String(x.name||'').trim().toLowerCase();return sp===pkg||sp.includes(pkg)||pkg.includes(sp)||sn===cleanName||sn.includes(cleanName)||cleanName.includes(sn)});let count=0;if(!loaded.length){setAnimeSearchLog(x=>[...x.filter((v:any)=>v.id!==key),{id:key,name:candidate.name||candidate.pkg,status:'error',error:'Installed, but Miwayomi exposed no matching source. Loaded anime sources: '+anime.length}]);continue}for(const src of loaded){const id=String(src.id);const data=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(id)+'/search?query='+encodeURIComponent(animeQuery)+'&page=1');const rows=Array.isArray(data)?data:(data.animes||data.results||data.items||data.list||[]);const matches=rows.filter((a:any)=>String(a.title||a.name||'').toLowerCase().includes(animeQuery.trim().toLowerCase()));count+=matches.length;found.push(...matches.map((a:any)=>({...a,sourceId:id,sourceName:src.name||candidate.name,sourceMeta:candidate})))}setAnimeSearchLog(x=>[...x.filter((v:any)=>v.id!==key),{id:key,name:candidate.name||candidate.pkg,status:'done',count}])}catch(e:any){setAnimeSearchLog(x=>[...x.filter((v:any)=>v.id!==key),{id:key,name:candidate.name||candidate.pkg,status:'error',error:e.message||String(e)}])}}setAnimeResults(found);setAnimeNotice({ok:found.length>0,scope:'search',text:found.length?found.length+' real result(s) found across the probed sources. Choose an anime to add it to your library.':'No real match found in the first '+candidates.length+' compatible sources.'});return}
const settled=await Promise.allSettled(usable.map(async(src:any)=>{const rawId=src.id??src.sourceId??src.sourceIdLong;if(rawId==null)throw Error('Miwayomi source has no source ID');const id=String(rawId);const name=src.name||src.sourceName||src.pkg||id;setAnimeSearchLog(x=>[...x.filter((v:any)=>v.id!==id),{id,name,status:'searching'}]);try{const data=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(id)+'/search?query='+encodeURIComponent(animeQuery)+'&page=1');const rows=Array.isArray(data)?data:(data.animes||data.results||data.items||data.list||[]);setAnimeSearchLog(x=>[...x.filter((v:any)=>v.id!==id),{id,name,status:'done',count:rows.length}]);return rows.map((a:any)=>({...a,sourceId:id,sourceName:name}))}catch(e:any){setAnimeSearchLog(x=>[...x.filter((v:any)=>v.id!==id),{id,name,status:'error',error:e.message||String(e)}]);return []}}));
const rows=settled.flatMap((r:any)=>r.status==='fulfilled'?r.value:[]);const norm=(v:any)=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();const wanted=norm(animeQuery);const ranked=rows.map((a:any)=>{const title=norm(a.title||a.name||'');const words=wanted.split(' ').filter(Boolean);let score=0;if(title===wanted)score=100;else if(title.startsWith(wanted+' '))score=90;else if(title.includes(wanted))score=80;else if(words.length&&words.every(w=>title.includes(w)))score=60;return{a,score}}).filter((x:any)=>x.score>0).sort((a:any,b:any)=>b.score-a.score);const deduped:any[]=[];const byTitle=new Map<string,any[]>();for(const r of ranked){const key=norm(r.a.title||r.a.name||'');if(!byTitle.has(key))byTitle.set(key,[]);byTitle.get(key)!.push(r.a)}for(const group of byTitle.values()){const primary=group[0];const alternates=group.slice(1).map((x:any)=>({sourceId:String(x.sourceId||''),sourceName:x.sourceName||x.source||'Anime source',url:x.url||x.path,name:x.title||x.name})).filter((x:any)=>x.sourceId&&x.url);deduped.push({...primary,alternates})}setAnimeResults(deduped);setAnimeNotice({ok:true,scope:'search',text:deduped.length+' relevant anime result'+(deduped.length===1?'':'s')+' found.'})
}catch(e:any){setAnimeNotice({ok:false,scope:'search',text:'Anime search failed: '+e.message})}finally{setAnimeSearching(false)}}}>{animeSearching?'Searching…':'Search anime'}</button></div>{animeResults.length>0&&<section className="panel anime-results"><h2>Search results</h2><div className="animegrid">{animeResults.map((a:any,i:number)=><article className="animecard" key={(a.id||a.url||a.title||'anime')+i}>{(a.thumbnail||a.cover)&&<img src={a.thumbnail||a.cover}/>}<h3>{a.title||a.name||'Untitled'}</h3><small>{a.sourceName||a.source||'Anime source'}</small>{<button className="primary" onClick={()=>{const alternates=Array.isArray(a.alternates)?a.alternates:[];const item={...a,id:a.id||a.url||Date.now()+'-'+i,name:a.title||a.name,alternates};const next=[item,...animeLibrary.filter(x=>x.id!==item.id)];setAnimeLibrary(next);localStorage.setItem('animeLibrary',JSON.stringify(next));setAnimeNotice({ok:true,scope:'search',text:item.name+' added to Anime Library.'})}}>Add to library</button>}</article>)}</div></section>}
</>}
{page==='anime'&&<><header><div><h1>Anime Library</h1><p>{animeLibrary.length} anime saved locally.</p></div></header>{animeLibrary.length===0?<section className="panel"><h2>Your Anime Library is empty</h2><p>Use Global Search to find an anime and add it to your library.</p></section>:<section className="animegrid">{animeLibrary.map(a=><article className="animecard" key={a.id}>{(a.thumbnail||a.cover)&&<img src={a.thumbnail||a.cover}/>}<h3>{a.name||a.title}</h3><small>{a.sourceName||a.source||'Anime'} · {Array.isArray(a.episodes)?a.episodes.length:(a.episodes||0)} episodes</small><button className="primary" disabled={animeDetailLoading} onClick={()=>openAnime(a)}>{animeDetailLoading?'Loading…':'Open anime'}</button></article>)}</section>}{animeNotice&&animeNotice.scope==='library'&&<div className={'anime-toast '+(animeNotice.ok?'ok':'error')}><NoticeText text={animeNotice.text}/><button onClick={()=>setAnimeNotice(null)}>×</button></div>}</>}
{page==='animeDetail'&&selectedAnime&&<><header><div><button className="backbtn" onClick={()=>setPage('anime')}>← Anime Library</button><h1>{selectedAnime.name||selectedAnime.title}</h1><p>{selectedAnime.sourceName||selectedAnime.source||'Anime'} · {selectedAnime.episodeCount??selectedAnime.episodes?.length??0} episodes</p></div></header><section className="panel"><h2>Episodes</h2>{!selectedAnime.episodes?.length?<p>No episodes returned by this source.</p>:<div className="episodegrid">{selectedAnime.episodes.map((ep:any,i:number)=>{const label=ep.name||ep.title||('Episode '+(ep.number||i+1));return <button className="episodecard" key={(ep.url||ep.path||ep.name||'ep')+i} disabled={animeVideoLoading} onClick={()=>playAnimeEpisode(ep)}><span className="episodebadge">{ep.number||String(label).match(/\d+(?:\.\d+)?/)?.[0]||'#'}</span><span className="episodetitle">{label}</span><span className="episodeplay">▶</span></button>})}</div>}{selectedEpisode&&<div className="anime-player"><h2>{selectedEpisode.name||selectedEpisode.title||'Episode'}</h2>{animeVideoLoading?<p>Extracting video streams…</p>:selectedVideo?<><AnimeVideo key={selectedVideo.streamUrl} video={selectedVideo}/>{animeVideos.length>1&&<div className="libraryactions">{animeVideos.map((v:any,i:number)=><button key={(v.videoUrl||v.url||'video')+i} className={selectedVideo===v?'primary':''} onClick={()=>setSelectedVideo(v)}>{v.videoTitle||v.quality||v.resolution||('Stream '+(i+1))}</button>)}</div>}</>:null}</div>}{animeNotice&&animeNotice.scope==='detail'&&<div className={'anime-toast '+(animeNotice.ok?'ok':'error')}><NoticeText text={animeNotice.text}/><button onClick={()=>setAnimeNotice(null)}>×</button></div>}</section></>}
{page==='settings'&&<SettingsPage lang={lang} onLang={changeLang} onWelcome={()=>setShowWelcome(true)}/>}
{page==='localVideos'&&<LocalVideos/>}
{page==='archive'&&<ArchivePage/>}
{page==='animeSources'&&<><header><div><h1>Anime Sources</h1><p>Install and manage Aniyomi-compatible sources.</p></div></header><section className={'panel anime-status '+(animeEngine?.online?'engine-online':animeEngine?'engine-offline':'')}><div className="engine-row"><div><h2>Anime Engine</h2><p>{animeEngine==null?'Not checked yet':animeEngine.online?'✓ Connected to Miwayomi':'✕ Offline — '+animeEngine.baseUrl}</p></div><button onClick={async()=>setAnimeEngine(await window.novelReader.miwayomiStatus())}>Check engine</button></div></section><section className="panel"><h2>Source repository</h2><input className="repo-input" value={animeRepoUrl} onChange={e=>setAnimeRepoUrl(e.target.value)}/><button className="primary" disabled={animeSourceLoading} onClick={async()=>{setAnimeSourceLoading(true);setAnimeNotice(null);try{const r=await fetch(animeRepoUrl);if(!r.ok)throw Error('Repository HTTP '+r.status);const data=await r.json();const list=Array.isArray(data)?data:(data.extensions||data.plugins||[]);const blocked=/hentai|jav|missav|xvideos|xnxx|myreadingmanga|torrent|debrid|nyaa|jable/i;setAnimeSources(list.filter((x:any)=>!blocked.test(String(x.name||x.pkg||''))))}catch(e:any){setAnimeNotice({ok:false,text:e.message})}finally{setAnimeSourceLoading(false)}}}>{animeSourceLoading?'Loading…':'Load sources'}</button>{animeSources.length>0&&<><p><b>{animeSources.length}</b> suitable sources</p><input className="repo-input" placeholder="Filter sources…" value={animeCatalogFilter} onChange={e=>setAnimeCatalogFilter(e.target.value)}/><div className="anime-source-list">{animeSources.filter((x:any)=>{const q=animeCatalogFilter.toLowerCase();return !q||String(x.name||x.pkg||'').toLowerCase().includes(q)||String(x.lang||'').toLowerCase().includes(q)}).slice(0,100).map((x:any,i:number)=><button className="anime-source-chip" key={(x.pkg||x.name||'source')+i} onClick={()=>installAnimeSource(x)}>{x.name||x.pkg}{x.lang?' · '+x.lang:''}</button>)}</div></>}{animeNotice&&animeNotice.scope==='sources'&&<div className={'anime-toast '+(animeNotice.ok?'ok':'error')}><NoticeText text={animeNotice.text}/><button onClick={()=>setAnimeNotice(null)}>×</button></div>}</section></>}
  {page==='search'&&<NovelSearch query={novelQuery} setQuery={setNovelQuery} plugins={plugins} ensurePlugins={ensurePlugins} library={library} onAdd={choose} onOpen={(n:any)=>{setSelectedNovel(n);setChapterFilter('');setPage('novel')}}/>}
 {page==='sources'&&<><header><div><h1>{t('Sources')}</h1><p>{t('Official LNReader repository · {n} sources loaded',{n:plugins.length||'—'})}</p></div><button className="primary"onClick={load}>{loading?t('Refreshing…'):t('Refresh repository')}</button></header><div className="searchbar"><input placeholder={t('Filter sources or language…')} value={filter}onChange={e=>setFilter(e.target.value)}/></div>{error&&<section className="panel"><NoticeText text={t('Repository error:')+' '+error}/></section>}<section className="sourcegrid">{shown.slice(0,300).map(p=><article className="sourcecard"key={p.id}><img src={p.iconUrl}/><div><b>{p.name}</b><small>{p.lang} · v{p.version}</small><small>{p.site}</small></div><button className={installed[p.id]?'installed':''} onClick={()=>installed[p.id]?uninstall(p):install(p)}>{installed[p.id]?t('Installed ✓'):t('Install')}</button></article>)}</section></>}
 </ErrorBoundary></main>{showKeys&&<ShortcutsDialog onClose={()=>setShowKeys(false)}/>}{showWelcome&&<Welcome lang={lang} onLang={changeLang} onClose={closeWelcome} onSearch={()=>{setModeState('books');lsSet('mode','books');setPageState('search');setTimeout(()=>focusPageSearch(),80)}}/>}</div>
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary full><App/></ErrorBoundary>)
