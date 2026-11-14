// Anime / Series / Movies pages: libraries (shelves, resume, new episodes),
// global search, detail hero/facts, and the video sources panels.
import{LangBar,useLangChoice,langOf,langName}from'../ui/lang-bar'
import React,{useEffect,useRef,useState}from'react'
import{cachedScan,loadScan,scanFor,setAside,keepSource,DEAD_DAYS,SECTIONS,hasOverride,resultFits,setSourceSections,sourceFits,sourceSections,type VideoSection}from'../lib/source-kinds'
import{t,plural,getLang}from'../i18n'
import{lsGet,lsSet,timeAgo}from'../lib/util'
import{EmptyState,Help,Cover,Icon,NoticeText,MoreMenu,GenreFilter}from'../ui/common'
import{titleInfo,matchScore,yearOf,searchQuery,sameTitle}from'../lib/title-match'
import{parental,kidsBlock}from'./parental'
import{altTitles}from'../lib/alt-titles'
import{forYou,seedsOf,type ForYou}from'../lib/recommend'
import{genreAllowed}from'../lib/parental'
import{mediaPosKey,readMediaPos,mediaNorm,mediaCover,enrichMediaCover,episodeNo,seasonNo,orderedEpisodes,cleanEngineError,readWatchStats,watchDayKey,watchedCount,type MediaKind}from'../lib/media'
import{engineFetch}from'../lib/engine'
import{sourceAdvice}from'../lib/source-advice'
import{catalogByGenre,genresFor,type CatalogTitle}from'../lib/genre-catalog'
// ---- Media libraries: mirror the polished Books library UX -----------------
// ---- New episodes: ask each title's source how many episodes it has now.
// Used by the library button and by the background check in App (every 6 h).
export const mediaEpCount=(a:any)=>Array.isArray(a?.episodes)?a.episodes.length:Number(a?.episodeCount||a?.episodes||0)
const mediaItemKey=(a:any)=>String(a?.id||a?.url||a?.path||a?.name||'')
export async function scanNewEpisodes(list:any[],onProgress?:(done:number,found:number,failed:number)=>void){
 let done=0,found=0,failed=0;const counts=new Map<string,number>(),names:string[]=[],queue=list.filter((a:any)=>a&&a.sourceId&&(a.url||a.path))
 await Promise.all(Array.from({length:4},async()=>{while(queue.length){const a=queue.shift();try{const d=await engineFetch('/api/v1/anime/'+encodeURIComponent(String(a.sourceId))+'/episodes?url='+encodeURIComponent(a.url||a.path));const n=(Array.isArray(d)?d:(d?.episodes||d?.items||[])).length;counts.set(mediaItemKey(a),n);if(n>mediaEpCount(a)&&mediaEpCount(a)>0){found++;names.push(String(a.name||a.title||''))}}catch{failed++}done++;onProgress?.(done,found,failed)}}))
 return{counts,found,failed,done,names}
}
export function applyEpisodeCounts(items:any[],counts:Map<string,number>){return items.map((a:any)=>{const n=counts.get(mediaItemKey(a));if(n==null||!n)return a;const prev=mediaEpCount(a);return n>prev&&prev>0?{...a,episodes:n,newEpisodes:(a.newEpisodes||0)+(n-prev)}:{...a,episodes:Math.max(n,prev)}})}
export function MediaLibrary({kind,items,onChange,onOpen,onSearch,loading,onResumeIntent}:{kind:'Anime'|'Series'|'Movie',items:any[],onChange:(x:any[])=>void,onOpen?:(x:any)=>void,onSearch:()=>void,loading?:boolean,onResumeIntent?:(a:any,epUrl:string,next?:boolean)=>void}){
 const[filter,setFilter]=useState(''),[sort,setSort]=useState<'recent'|'title'>(()=>(lsGet('mediaSort:'+kind) as any)||'recent'),[undo,setUndo]=useState<{item:any,index:number}|null>(null)
 useEffect(()=>{if(!undo)return;const t=setTimeout(()=>setUndo(null),7000);return()=>clearTimeout(t)},[undo])
 const storeKey=kind==='Anime'?'animeLibrary':kind==='Series'?'seriesLibrary':'movieLibrary'
 const save=(next:any[])=>{onChange(next);localStorage.setItem(storeKey,JSON.stringify(next));window.dispatchEvent(new Event('nr-media-changed'))}
 const epCount=(a:any)=>Array.isArray(a?.episodes)?a.episodes.length:Number(a?.episodeCount||a?.episodes||0)
 // "Continue watching": the title whose episode was played most recently.
 const keyPrefix=kind==='Anime'?'anime:':kind==='Series'?'series:':'movie:'
 const last=items.map((a:any)=>{if(a.shelf==='dropped')return null;let info:any=null;try{info=JSON.parse(lsGet('lastEpInfo:'+String(a.id||a.url||a.name))||'null')}catch{}if(!info?.url)return null;const pos=readMediaPos(keyPrefix+(a.id||a.url||a.name)+(kind==='Movie'?'':':'+info.url));return{a,info,pos}}).filter(Boolean).sort((x:any,y:any)=>(y.info.at||0)-(x.info.at||0))[0] as any
 const fmt=(sec:number)=>{const s=Math.max(0,Math.floor(sec||0)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return (h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(r).padStart(2,'0')}
 const open=(a:any)=>{if(a.newEpisodes){save(items.map(x=>x===a?{...x,newEpisodes:0}:x))}onOpen?.(a)}
 const resume=(r:any)=>{const nx=kind!=='Movie'&&r.pos?.done&&(r.info.n||0)<epCount(r.a);onResumeIntent?.(r.a,r.info.url,nx);open(r.a)}
 // "Up next": every title in progress with its next episode (or the one to finish).
 const upNext=kind==='Movie'?[]:items.map((a:any)=>{if(a.shelf==='dropped'||a===last?.a)return null;let info:any=null;try{info=JSON.parse(lsGet('lastEpInfo:'+String(a.id||a.url||a.name))||'null')}catch{}if(!info?.url)return null;const pos=readMediaPos(keyPrefix+(a.id||a.url||a.name)+':'+info.url),n=Number(info.n)||1,total=epCount(a)
  if(pos?.done&&total&&n>=total)return null
  return{a,info,pos,next:Boolean(pos?.done),n:pos?.done?n+1:n,left:pos&&!pos.done&&pos.d>0?Math.max(1,Math.round((pos.d-pos.t)/60)):0}}).filter(Boolean).sort((x:any,y:any)=>(y.info.at||0)-(x.info.at||0)).slice(0,10) as any[]
 // "Check for new episodes": compare each title's episode count with its source.
 const[upd,setUpd]=useState<{running:boolean,done:number,total:number,found:number,failed:number,at:number}>({running:false,done:0,total:0,found:0,failed:0,at:0})
 const checkNew=async()=>{const list=items.filter((a:any)=>a.sourceId&&(a.url||a.path));if(!list.length)return;setUpd({running:true,done:0,total:list.length,found:0,failed:0,at:0});const r=await scanNewEpisodes(list,(done,found,failed)=>setUpd(u=>({...u,done,found,failed})));save(applyEpisodeCounts(items,r.counts));lsSet('lastEpisodeCheck',String(Date.now()));setUpd({running:false,done:r.done,total:list.length,found:r.found,failed:r.failed,at:Date.now()})}
 // Watch status shelves (same tabs as the Books library).
 const VSHELVES=[{id:'watching',label:t('Watching')},{id:'plan',label:t('Plan to watch')},{id:'completed',label:t('Completed')},{id:'dropped',label:t('Dropped')}]
 const shelfOf=(a:any)=>VSHELVES.some(x=>x.id===a.shelf)?a.shelf:(lsGet('lastEpInfo:'+String(a.id||a.url||a.name))?'watching':'plan')
 const[shelf,setShelf]=useState<string>(()=>lsGet('mediaShelf:'+kind)||'all')
 const setItemShelf=(a:any,v:string)=>save(items.map(x=>x===a?{...x,shelf:v,shelfAt:Date.now()}:x))
 const counts:Record<string,number>={};for(const a of items){const k=shelfOf(a);counts[k]=(counts[k]||0)+1}
 // Missing covers: ask the source for the details of up to 6 titles per visit.
 const coverTried=useRef(new Set<string>())
 useEffect(()=>{const todo=items.filter((a:any)=>!mediaCover(a)&&a.sourceId&&(a.url||a.path)&&!coverTried.current.has(String(a.id))).slice(0,6);if(!todo.length)return;todo.forEach((a:any)=>coverTried.current.add(String(a.id)));let alive=true
  ;(async()=>{const got=new Map<string,any>();for(const a of todo){try{const e=await enrichMediaCover(a);const c=mediaCover(e),g=genreList(e?.genre??e?.genres);if(c||g.length)got.set(String(a.id),{...(c?{thumbnail:c}:{}),...(g.length&&!Array.isArray(a.genres)?{genres:g}:{})})}catch{}}if(!alive||!got.size)return;save(items.map((x:any)=>got.has(String(x.id))?{...x,...got.get(String(x.id))}:x))})()
  return()=>{alive=false}},[items.length])
 const q=filter.trim().toLowerCase()
 const[genre,setGenre]=useState(()=>lsGet('mediaGenre:'+kind)||''),pickGenre=(g:string)=>{setGenre(g);lsSet('mediaGenre:'+kind,g)}
 const shown=items.filter((x:any)=>shelf==='all'||shelfOf(x)===shelf).filter((x:any)=>!genre||(x.genres||[]).includes(genre)).filter(x=>(kind==='Anime'||!/streamingunity|streamingcommunity/i.test(String(x.sourceName||x.source||'')))&&(!q||String((x.name||x.title||'')+' '+(x.sourceName||x.source||'')).toLowerCase().includes(q))).sort((a,b)=>sort==='title'?String(a.name||a.title||'').localeCompare(String(b.name||b.title||'')):(b.addedAt||0)-(a.addedAt||0))
 const remove=(item:any)=>{const index=items.indexOf(item);const next=items.filter(x=>x!==item);try{const rm=JSON.parse(localStorage.getItem('mediaRemoved')||'{}');rm[storeKey+':'+item.id]=Date.now();localStorage.setItem('mediaRemoved',JSON.stringify(rm))}catch{}save(next);setUndo({item,index})}
 const restore=()=>{if(!undo)return;const next=[...items];next.splice(Math.min(undo.index,next.length),0,{...undo.item,addedAt:Date.now()});save(next);setUndo(null)}
 return <div className="media-page books-ui"><header><div><h1>{kind==='Anime'?t('Anime Library'):kind==='Series'?t('Series Library'):t('Movie Library')}</h1><p>{kind==='Anime'?plural(items.length,'{n} anime saved on this PC.','{n} anime saved on this PC.'):kind==='Series'?plural(items.length,'{n} series saved on this PC.','{n} series saved on this PC.'):plural(items.length,'{n} movie saved on this PC.','{n} movies saved on this PC.')}</p></div></header>
 {items.length===0?<EmptyState icon={kind==='Movie'?'film':kind==='Series'?'tv':'play'} title={t('Your library is empty')} text={t('Search a title, pick a result: it is saved here.')} action={t('Search a title')} onAction={onSearch}/>:<>
  {last&&!q&&<section className="lib-resume" onClick={()=>resume(last)}><Cover src={mediaCover(last.a)} name={last.a.name||last.a.title||kind}/><div className="lib-resume-meta"><small>{t('Continue where you left off')} · {timeAgo(last.info.at)}</small><h2>{last.a.name||last.a.title}</h2><p>{[kind==='Movie'?'':(last.info.name||t('Episode {n}',{n:last.info.n})),last.pos&&!last.pos.done?t('stopped at {time}',{time:fmt(last.pos.t)}):last.pos?.done?t('finished'):''].filter(Boolean).join(' · ')}</p>{last.pos&&last.pos.d>0&&<div className="libbar"><span style={{width:Math.min(100,last.pos.t/last.pos.d*100)+'%'}}/></div>}</div><button className="primary" onClick={e=>{e.stopPropagation();resume(last)}}>{kind==='Movie'?t('Resume the movie'):last.pos?.done&&(last.info.n||0)<epCount(last.a)?t('Next · Ep. {n}',{n:(Number(last.info.n)||1)+1}):t('Continue · Ep. {n}',{n:last.info.n||1})}</button></section>}
  {upNext.length>0&&!q&&<section className="upnext"><h2>{t('Up next')}</h2><div className="upnext-row">{upNext.map((r:any)=><button key={String(r.a.id||r.a.url||r.a.name)} className="upnext-card" onClick={()=>{onResumeIntent?.(r.a,r.info.url,r.next);open(r.a)}} title={r.a.name||r.a.title}><Cover src={mediaCover(r.a)} name={r.a.name||r.a.title||kind}/><span className="upnext-meta"><b>{r.a.name||r.a.title}</b><small>{r.next?t('Next · Ep. {n}',{n:r.n}):t('Continue · Ep. {n}',{n:r.n})}{r.left?' · '+t('{n} min left',{n:r.left}):''}</small>{r.pos&&!r.pos.done&&r.pos.d>0&&<span className="libbar"><span style={{width:Math.min(100,r.pos.t/r.pos.d*100)+'%'}}/></span>}</span></button>)}</div></section>}
  {!q&&<WatchStats/>}
  <div className="shelftabs" role="tablist" aria-label={t('Shelves')}>{[{id:'all',label:t('All'),n:items.length},...VSHELVES.map(x=>({...x,n:counts[x.id]||0}))].map(x=><button key={x.id} role="tab" aria-selected={shelf===x.id} className={'shelftab'+(shelf===x.id?' on':'')} onClick={()=>{setShelf(x.id);lsSet('mediaShelf:'+kind,x.id)}}>{x.label} <small>{x.n}</small></button>)}</div>
  <GenreFilter lists={items.map((x:any)=>x.genres||[])} value={genre} onChange={pickGenre}/>
  <div className="lib-toolbar"><div className="searchbar"><input placeholder={t('Filter by title or source…')} value={filter} onChange={e=>setFilter(e.target.value)} aria-label={t('Filter by title or source…')}/></div>{kind!=='Movie'&&<button className="lib-update" disabled={upd.running} onClick={checkNew}>{upd.running?t('Checking {done}/{total}…',{done:upd.done,total:upd.total}):t('Check for new episodes')}</button>}<label className="lib-sort">{t('Sort')}<select value={sort} onChange={e=>{const v=e.target.value as 'recent'|'title';setSort(v);lsSet('mediaSort:'+kind,v)}}><option value="recent">{t('Recently added')}</option><option value="title">{t('Title A–Z')}</option></select></label></div>
  {!upd.running&&upd.at>0&&<p className="lib-update-status" role="status">{upd.found?plural(upd.found,'{n} title has new episodes.','{n} titles have new episodes.'):t('Everything is up to date.')}{upd.failed?' '+plural(upd.failed,'{n} source did not answer.','{n} sources did not answer.'):''}</p>}
  {shown.length===0?<EmptyState icon="grid" title={t('No title matches “{q}”.',{q:filter})} action={t('Clear the filter')} onAction={()=>setFilter('')}/>:<section className="libgrid">{shown.map((a:any)=><article className="libcard" key={a.id} onClick={e=>{if(onOpen&&!(e.target as HTMLElement).closest('button,select,a,label,.more-menu'))open(a)}}><button className="libcard-cover" onClick={()=>open(a)} disabled={!onOpen} aria-label={t('Open {name}',{name:a.name||a.title})}><Cover src={mediaCover(a)} name={a.name||a.title||kind}/></button><div className="libcard-meta"><h2 title={a.name||a.title}><button className="libtitle" onClick={()=>open(a)} disabled={!onOpen}>{a.name||a.title}</button></h2>{Number(a.newEpisodes)>0&&<span className="newbadge">{t('+{n} new',{n:a.newEpisodes})}</span>}<p>{a.sourceName||a.source||kind}</p><small>{[kind!=='Movie'?plural(Number(Array.isArray(a.episodes)?a.episodes.length:(a.episodeCount||a.episodes||0)),'{n} episode','{n} episodes')+((n=>n?' · '+t('{n} watched',{n}):'')(watchedCount(keyPrefix,String(a.id||a.url||a.name)))):'',a.addedAt?t('added {when}',{when:timeAgo(a.addedAt)}):''].filter(Boolean).join(' · ')}</small><div className="libraryactions">{onOpen&&<button className="primary" disabled={loading} onClick={()=>open(a)}>{loading?t('Loading…'):kind==='Movie'?t('Watch the movie'):t('Show episodes')}</button>}<MoreMenu><label className="more-field"><span>{t('Shelf')}</span><select className="shelfselect" value={shelfOf(a)} aria-label={t('Shelf')} onChange={e=>setItemShelf(a,e.target.value)}>{VSHELVES.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label><button className="removebtn" role="menuitem" onClick={()=>remove(a)}><Icon name="trash" inline/>{t('Remove from the library')}</button></MoreMenu></div></div></article>)}</section>}
 </>}
 {undo&&<div className="anime-toast ok lib-undo" role="status"><span>{t('Removed “{name}”.',{name:undo.item.name||undo.item.title})}</span><div><button className="undo-btn" onClick={restore}>{t('Undo')}</button><button aria-label={t('Dismiss')} onClick={()=>setUndo(null)}>×</button></div></div>}
 </div>
}



// ---- Watch statistics (shared by Anime / Series / Movies) ------------------------
const fmtWatch=(sec:number)=>{const m=Math.round(sec/60);if(m<60)return t('{n} min',{n:m});const h=Math.floor(m/60),r=m%60;return r?t('{h} h {m} min',{h,m:r}):t('{h} h',{h})}
export function WatchStats(){
 const[open,setOpen]=useState(()=>lsGet('watchStatsOpen')!=='0'),[hover,setHover]=useState<number|null>(null)
 const all=readWatchStats()
 if(!Object.keys(all).length)return null
 const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const k=watchDayKey(d);return{date:d,key:k,s:all[k]?.s||0,e:all[k]?.e||0}})
 const week={s:days.reduce((a,d)=>a+d.s,0),e:days.reduce((a,d)=>a+d.e,0)}
 let streak=0;{const d=new Date();if((all[watchDayKey(d)]?.s||0)<60)d.setDate(d.getDate()-1);for(;;){const x=all[watchDayKey(d)];if(x&&x.s>=60){streak++;d.setDate(d.getDate()-1)}else break}}
 const max=Math.max(60,...days.map(d=>d.s))
 const label=(d:typeof days[number])=>d.date.toLocaleDateString(getLang(),{weekday:'long',day:'numeric',month:'short'})+' · '+fmtWatch(d.s)+(d.e?' · '+plural(d.e,'{n} episode','{n} episodes'):'')
 return <section className="panel stats">
  <button className="stats-head" aria-expanded={open} onClick={()=>{setOpen(!open);lsSet('watchStatsOpen',open?'0':'1')}}><span>{t('Your watching this week')}</span><small>{fmtWatch(week.s)} · {plural(week.e,'{n} episode','{n} episodes')}</small><span className="stats-chev" aria-hidden="true">{open?'▴':'▾'}</span></button>
  {open&&<div className="stats-body">
   <div className="stats-tiles"><div><b>{fmtWatch(week.s)}</b><small>{t('watched in 7 days')}</small></div><div><b>{week.e}</b><small>{t('episodes finished in 7 days')}</small></div><div><b>{streak}</b><small>{plural(streak,'day in a row','days in a row')}</small></div></div>
   <figure className="stats-chart" aria-label={t('Time watched per day, last 7 days')}><div className="stats-bars" onMouseLeave={()=>setHover(null)}>{days.map((d,i)=><button key={d.key} className={'stats-bar'+(hover===i?' on':'')} onMouseEnter={()=>setHover(i)} onFocus={()=>setHover(i)} onBlur={()=>setHover(null)} aria-label={label(d)}><span className="stats-fill" style={{height:d.s?Math.max(4,d.s/max*100)+'%':'0'}}/><span className="stats-day">{d.date.toLocaleDateString(getLang(),{weekday:'short'})}</span></button>)}</div>{hover!=null&&<div className="stats-tip" role="status" style={{left:((hover+0.5)/7*100)+'%'}}>{label(days[hover])}</div>}</figure>
  </div>}
 </section>
}

// ---- Episode list with watched marks ------------------------------------------
export function EpisodeGrid({eps,prefix,mediaId,selected,disabled,onPlay,renderExtra}:{eps:any[],prefix:string,mediaId:string,selected:any,disabled?:boolean,onPlay:(ep:any)=>void,renderExtra?:(ep:any,i:number)=>any}){
 const[,bump]=useState(0)
 useEffect(()=>{const f=()=>bump(x=>x+1);window.addEventListener('nr-watched',f);window.addEventListener('nr-media-synced',f);return()=>{window.removeEventListener('nr-watched',f);window.removeEventListener('nr-media-synced',f)}},[])
 const keyOf=(ep:any,i:number)=>prefix+mediaId+':'+String(ep.url||ep.path||ep.number||ep.name||i)
 const posOf=(ep:any,i:number)=>readMediaPos(keyOf(ep,i))
 const setWatched=(list:{ep:any,i:number}[],on:boolean)=>{for(const {ep,i} of list){const k=mediaPosKey(keyOf(ep,i));if(on)localStorage.setItem(k,JSON.stringify({t:0,d:0,done:true,at:Date.now()}));else localStorage.removeItem(k)}window.dispatchEvent(new Event('nr-media-changed'));bump(x=>x+1)}
 const watched=eps.filter((ep,i)=>posOf(ep,i)?.done).length
 const all=eps.map((ep,i)=>({ep,i}))
 // Seasons: chips to show one season (the one you are in by default), or all with a
 // heading per season. Order: first to last, or last to first (remembered).
 const seasons=[...new Set(eps.map(ep=>seasonNo(ep)))].sort((a,b)=>a-b)
 const current=(()=>{const sel=selected?eps.indexOf(selected):-1;if(sel>=0)return seasonNo(eps[sel]);const next=all.find(x=>!posOf(x.ep,x.i)?.done);return next?seasonNo(next.ep):seasons[0]})()
 const[season,setSeason]=useState<number|'all'|null>(null)
 const[desc,setDesc]=useState(()=>lsGet('epOrder')==='desc')
 const shown=seasons.length>1?(season??current):'all'
 let list=all.filter(x=>shown==='all'||seasonNo(x.ep)===shown)
 if(desc)list=[...list].reverse()
 const cellOf=(ep:any,i:number)=>{const label=ep.name||ep.title||t('Episode {n}',{n:episodeNo(ep,i+1)}),active=selected===ep,pos=posOf(ep,i),done=!!pos?.done,pct=!done&&pos&&pos.d>0?Math.min(100,pos.t/pos.d*100):0
   return <div className="episodecell" key={(ep.url||ep.path||ep.name||'ep')+i}><button className={'episodecard'+(active?' active':'')+(done?' watched':'')} disabled={disabled} onClick={()=>onPlay(ep)}><span className="episodebadge">S{seasonNo(ep)}<b>E{episodeNo(ep,i+1)}</b></span><span className="episodetitle">{label}</span><span className="episodeplay">{active?'▶':'▷'}</span>{pct>0&&<span className="episodeprog" style={{width:pct+'%'}}/>}</button>
    <button className={'ep-watch'+(done?' on':'')} aria-pressed={done} title={done?t('Mark as unwatched'):t('Mark as watched (and the previous ones with Shift)')} aria-label={done?t('Mark as unwatched'):t('Mark as watched')} onClick={e=>setWatched(e.shiftKey&&!done?all.slice(0,i+1):[{ep,i}],!done)}>{done?'✓':''}</button>{renderExtra?.(ep,i)}</div>}
 const rows:any[]=[];let lastS:number|null=null
 for(const{ep,i}of list){const sn=seasonNo(ep);if(shown==='all'&&seasons.length>1&&sn!==lastS){rows.push(<h3 className="season-head" key={'s'+sn}>{t('Season {n}',{n:sn})}</h3>);lastS=sn}rows.push(cellOf(ep,i))}
 return <>
  <div className="episode-tools"><small>{t('{n} / {total} watched',{n:watched,total:eps.length})}</small>{eps.length>1&&<button onClick={()=>{const d=!desc;setDesc(d);lsSet('epOrder',d?'desc':'asc')}} title={t('Order of the episodes')}>{desc?'↓ '+t('Last to first'):'↑ '+t('First to last')}</button>}{eps.length>0&&<button onClick={()=>setWatched(all,watched<eps.length)}>{watched<eps.length?t('Mark all as watched'):t('Mark all as unwatched')}</button>}</div>
  {seasons.length>1&&<div className="season-chips" role="tablist" aria-label={t('Seasons')}>{seasons.map(sn=><button key={sn} role="tab" aria-selected={shown===sn} className={'chip'+(shown===sn?' on':'')} onClick={()=>setSeason(sn)}>{t('Season {n}',{n:sn})} <small>{eps.filter(ep=>seasonNo(ep)===sn).length}</small></button>)}<button role="tab" aria-selected={shown==='all'} className={'chip'+(shown==='all'?' on':'')} onClick={()=>setSeason('all')}>{t('All seasons')}</button></div>}
  <div className="episodegrid">{rows}</div>
 </>
}

// ---- Video sources: test installed extensions and remove the dead ones ----------
// Result of the weekly automatic check, for sources not tested on this PC.
// Sources page: the installed sources that were set aside, and the way back.
export function SetAsideNotice(){
 const[names,setNames]=useState<string[]>([])
 useEffect(()=>{let alive=true;const load=()=>engineFetch('/api/v1/sources').then((sr:any)=>{if(!alive)return;const l=(Array.isArray(sr)?sr:(sr?.anime||sr?.sources||sr?.items||[]));setNames(Array.from(new Set(l.map((x:any)=>String(x?.name||'')).filter((n:string)=>n&&setAside(n)))))}).catch(()=>{})
  load();window.addEventListener('nr-sources-changed',load);window.addEventListener('nr-source-scan',load);return()=>{alive=false;window.removeEventListener('nr-sources-changed',load);window.removeEventListener('nr-source-scan',load)}},[])
 if(!names.length)return null
 return <section className="panel set-aside" role="status"><h2>{plural(names.length,'{n} source set aside','{n} sources set aside')}</h2>
  <Help text={t('The weekly check has found these sources not working for more than {n} days. They are left out of searches and Discover so results come faster; they come back by themselves when they work again.',{n:DEAD_DAYS})}/>
  <div className="set-aside-list">{names.map(n=><span key={n} className="set-aside-item"><b>{n}</b><button onClick={()=>keepSource(n)}>{t('Use anyway')}</button></span>)}</div>
 </section>}
function WeeklyScan({pkg,name}:{pkg:string,name:string}){const[,bump]=useState(0);useEffect(()=>{const f=()=>bump(x=>x+1);window.addEventListener('nr-source-scan',f);loadScan().catch(()=>{});return()=>window.removeEventListener('nr-source-scan',f)},[]);const sc=scanFor(pkg)||scanFor(name),at=cachedScan()?.at;if(!sc)return null;return <><small className={'scan-line '+sc.state}>{(sc.state==='ok'?'✓ ':sc.state==='partial'?'~ ':'✗ ')+t('Weekly check ({date}): {state}',{date:at?new Date(at).toLocaleDateString():'',state:sc.state==='ok'?t('plays videos'):sc.state==='partial'?t('partly works'):/^On Android/.test(sc.detail||'')?t('does not play on a phone'):t('not responding')})}</small>{sc.state!=='ok'&&!/^On Android/.test(sc.detail||'')&&<AdviceLine msg={sc.detail||''}/>}</>}
// Why a source fails, in plain words, and what to do (the technical text on hover).
function AdviceLine({msg}:{msg:string}){const a=sourceAdvice(msg,document.documentElement.classList.contains('android'));if(!a)return null;return <small className="source-advice" title={msg}><b>{a.why}</b> {a.fix}</small>}
// Which sections (Anime / Series / Movies) show this source; click to change.
function SectionChips({name}:{name:string}){
 const[,bump]=useState(0),cur=sourceSections(name),custom=hasOverride(name)
 const label:Record<VideoSection,string>={anime:t('Anime'),series:t('Series'),movies:t('Movies')}
 const toggle=(sec:VideoSection)=>{const next=cur.includes(sec)?cur.filter(x=>x!==sec):[...cur,sec];if(!next.length)return;setSourceSections(name,next);bump(x=>x+1)}
 return <span className={'sec-chips'+(custom?' custom':'')} role="group" aria-label={t('Sections for {name}',{name})} title={t('Sections where this source is used. Click to change.')}>{SECTIONS.map(sec=><button key={sec} aria-pressed={cur.includes(sec)} className={'sec-chip'+(cur.includes(sec)?' on':'')} onClick={()=>toggle(sec)}>{label[sec]}</button>)}{custom&&<button className="sec-reset" title={t('Back to automatic')} aria-label={t('Back to automatic')} onClick={()=>{setSourceSections(name,[]);bump(x=>x+1)}}>↺</button>}</span>
}
const sectionOf=(kind:MediaKind):VideoSection=>kind==='Anime'?'anime':kind==='Series'?'series':'movies'
// ---- Source check: list → episodes → video streams, one title per extension ----
type HealthRow={pkg:string,name:string,sources:any[],state:'idle'|'testing'|'ok'|'warn'|'dead',error?:string,detail?:string,step?:string}
function readHealthRows():HealthRow[]{try{const h=JSON.parse(lsGet('videoSourceHealth')||'{}');return Object.entries(h).filter(([,v]:any)=>v&&typeof v.state==='string').map(([pkg,v]:any)=>({pkg,name:v.name||pkg,sources:(v.sourceIds||[]).map((id:string)=>({id})),state:v.state,detail:v.detail,error:v.error}))}catch{return[]}}
const asList=(d:any,...keys:string[])=>Array.isArray(d)?d:(keys.map(k=>d?.[k]).find(Array.isArray)||[])
export async function checkExtension(r:{sources:any[]},onStep?:(s:string)=>void):Promise<{state:'ok'|'warn'|'dead',detail:string,error:string}>{
 if(!r.sources.length)return{state:'dead',detail:'',error:t('No video source in this extension')}
 let best:{state:'ok'|'warn'|'dead',detail:string,error:string}={state:'dead',detail:'',error:''}
 for(const s of r.sources.slice(0,2)){
  const sid=encodeURIComponent(String(s.id)),steps:string[]=[]
  try{
   onStep?.(t('Loading the list…'));const items=asList(await engineFetch('/api/v1/anime/'+sid+'/popular?page=1'),'animes','results','items','list')
   // An empty list does not prove the source is down (search may still work): partly.
   if(!items.length){if(best.state==='dead')best={state:'warn',detail:t('List')+' ✗',error:t('The list is empty')};continue}
   steps.push(t('List')+' ✓')
   let epOk=false,vidOk=0,err=''
   for(const a of items.slice(0,2)){
    try{onStep?.(t('Loading episodes…'));const eps=asList(await engineFetch('/api/v1/anime/'+sid+'/episodes?url='+encodeURIComponent(a.url||a.path)),'episodes','items')
     if(!eps.length){err=t('No episode');continue}
     epOk=true;const ep=orderedEpisodes(eps)[0]
     onStep?.(t('Looking for streams…'));const vids=asList(await engineFetch('/api/v1/anime/'+sid+'/videos?url='+encodeURIComponent(ep.url||ep.path)),'videos','items','list')
     if(vids.length){vidOk=vids.length;break}
     err=t('No stream found')
    }catch(e:any){err=cleanEngineError(e).slice(0,160)}
   }
   steps.push(t('Episodes')+(epOk?' ✓':' ✗'))
   steps.push(vidOk?t('Streams')+' ✓ ('+vidOk+')':t('Streams')+' ✗')
   const res={state:vidOk?'ok' as const:'warn' as const,detail:steps.join(' · '),error:vidOk?'':err}
   if(res.state==='ok')return res
   best=res
  }catch(e:any){if(best.state==='dead')best={state:'dead',detail:'',error:cleanEngineError(e).slice(0,160)}}
 }
 return best
}
export function VideoSourceHealth(){
 const[rows,setRows]=useState<HealthRow[]>(()=>readHealthRows()),[running,setRunning]=useState(false),[confirm,setConfirm]=useState(false),[msg,setMsg]=useState('')
 // Show the installed sources (and their sections) before any test.
 useEffect(()=>{if(!rows.length)load().then(list=>setRows(rs=>rs.length?rs:list)).catch(()=>{})},[])
 const load=async()=>{const[inst,src]=await Promise.all([engineFetch('/api/v1/extensions/installed'),engineFetch('/api/v1/sources')]);const exts=Array.isArray(inst)?inst:(inst?.extensions||inst?.items||[]);const anime=Array.isArray(src)?src:(src?.anime||src?.sources||[]);return exts.filter((e:any)=>e&&e.pkg).map((e:any)=>({pkg:String(e.pkg),name:String(e.name||e.pkg).replace(/^Aniyomi:\s*/i,''),sources:anime.filter((s:any)=>String(s.pkg||'')===String(e.pkg)),state:'idle' as const}))}
 const test=async()=>{setRunning(true);setMsg('');setConfirm(false);try{const list=await load();setRows(list.map(r=>({...r,state:'testing',step:''})));const queue=[...list],saved:any={}
   await Promise.all(Array.from({length:4},async()=>{while(queue.length){const r=queue.shift()!;const res=await checkExtension(r,step=>setRows(rs=>rs.map(x=>x.pkg===r.pkg?{...x,step}:x)));saved[r.pkg]={name:r.name,state:res.state,detail:res.detail,error:res.error,at:Date.now(),sourceIds:r.sources.map((x:any)=>String(x.id))};setRows(rs=>rs.map(x=>x.pkg===r.pkg?{...x,...res,step:''}:x))}}))
   lsSet('videoSourceHealth',JSON.stringify(saved));lsSet('videoSourceHealthAt',String(Date.now()))}catch(e:any){setMsg(String(e?.message||e))}finally{setRunning(false)}}
 const uninstall=async(pkgs:string[])=>{let n=0;for(const pkg of pkgs){try{await engineFetch('/api/v1/extensions/uninstall','POST',{pkg});n++}catch{}}setRows(rs=>rs.filter(r=>!pkgs.includes(r.pkg)));try{const h=JSON.parse(lsGet('videoSourceHealth')||'{}');for(const p of pkgs)delete h[p];lsSet('videoSourceHealth',JSON.stringify(h))}catch{}setConfirm(false);setMsg(plural(n,'{n} source removed.','{n} sources removed.'))}
 const dead=rows.filter(r=>r.state==='dead'),okN=rows.filter(r=>r.state==='ok').length,warnN=rows.filter(r=>r.state==='warn').length,done=rows.filter(r=>r.state==='ok'||r.state==='dead'||r.state==='warn').length,at=Number(lsGet('videoSourceHealthAt'))||0
 const tested=rows.some(r=>r.state!=='idle')
 return <section className="panel source-health"><div className="engine-row"><div><h2>{t('Installed sources')}</h2><p>{tested?(running?t('Testing {done} / {total} sources…',{done,total:rows.length}):t('{ok} working, {warn} partly working, {dead} not responding.',{ok:okN,warn:warnN,dead:dead.length})+(at&&!running?' · '+t('Checked {when}',{when:timeAgo(at)}):'')):t('Check which installed sources still work, and remove the ones that are down.')}</p></div><button className={tested?'':'primary'} disabled={running} onClick={test}>{running?t('Testing…'):tested?t('Test again'):t('Test my sources')}</button></div>
  {rows.length>0&&<div className="health-list">{rows.map(r=><div key={r.pkg} className={'health-row '+r.state}><span className="health-dot" aria-hidden="true"/><div><b>{r.name}</b>{r.state==='testing'&&r.step?<small>{r.step}</small>:r.detail?<small className="health-steps">{r.detail}</small>:<WeeklyScan pkg={r.pkg} name={r.name}/>}{(r.state==='dead'||r.state==='warn')&&r.error&&<AdviceLine msg={r.error}/>}</div><SectionChips name={r.name}/><span className="health-state">{r.state==='testing'?t('Testing…'):r.state==='ok'?t('Plays'):r.state==='warn'?t('Partly'):r.state==='dead'?t('Not responding'):''}</span>{r.state==='dead'&&<button className="removebtn" onClick={()=>uninstall([r.pkg])}>{t('Uninstall')}</button>}</div>)}</div>}
  {!running&&dead.length>0&&<div className="libraryactions health-actions">{confirm?<><span>{plural(dead.length,'Uninstall {n} source that is not responding?','Uninstall {n} sources that are not responding?')}</span><button className="removebtn" onClick={()=>uninstall(dead.map(r=>r.pkg))}>{t('Yes, uninstall')}</button><button onClick={()=>setConfirm(false)}>{t('Cancel')}</button></>:<button className="removebtn" onClick={()=>setConfirm(true)}>{plural(dead.length,'Remove {n} dead source','Remove {n} dead sources')}</button>}</div>}
  {msg&&<p className="lib-update-status" role="status">{msg}</p>}
 </section>
}
// ---- Cloudflare protection (FlareSolverr) ---------------------------------------
export function CloudflarePanel(){
 const api=window.novelReader as any,[st,setSt]=useState<FlareStatus|null>(null),[busy,setBusy]=useState(false),[err,setErr]=useState('')
 const refresh=async()=>{try{setSt(await api.flareStatus())}catch{}}
 useEffect(()=>{if(!api.flareStatus)return;refresh();const id=setInterval(()=>{if(busy)refresh()},1500);return()=>clearInterval(id)},[busy])
 if(!api.flareStatus||!st)return null
 const act=async(fn:()=>Promise<any>)=>{setBusy(true);setErr('');try{setSt(await fn())}catch(e:any){setErr(cleanEngineError(e))}finally{setBusy(false);refresh()}}
 return <section className={'panel anime-status '+(st.running?'engine-online':'')}><div className="engine-row"><div><h2>{t('Cloudflare protection')}</h2><p>{st.running?'✓ '+t('FlareSolverr is running: sites protected by Cloudflare (AniDB…) can be used.'):st.installing?t('Installing FlareSolverr… {n}%',{n:st.progress}):st.installed?t('FlareSolverr is installed but not running.'):t('Some sites (AniDB…) are protected by Cloudflare. Install FlareSolverr once (about 150 MB) to use them.')}</p>{(err||st.error)&&<small>{err||st.error}</small>}</div>{!st.running&&(st.installed?<button disabled={busy} onClick={()=>act(api.flareStart)}>{t('Start')}</button>:st.supported?<button className="primary" disabled={busy||st.installing} onClick={()=>act(api.flareInstall)}>{st.installing||busy?t('Installing…'):t('Install FlareSolverr')}</button>:null)}</div></section>
}

// ---- Discover: Popular / Latest lists of one source, to browse without a title in mind
const discoverCache=new Map<string,{rows:any[],page:number,more:boolean}>()
export function MediaDiscover({kind,library,onAdd,onLibrary,onWatch,onFind}:{kind:MediaKind,library:any[],onAdd:(a:any)=>Promise<void>|void,onLibrary:()=>void,onWatch?:(a:any)=>Promise<void>|void,onFind?:(title:string)=>void}){
 const[sources,setSources]=useState<any[]|null>(null),[source,setSource]=useState(()=>lsGet('discoverSource:'+kind)||''),[tab,setTab]=useState<'popular'|'latest'|'genres'|'foryou'>(()=>{const v=lsGet('discoverTab:'+kind);return v==='latest'||(v==='genres'||v==='foryou')&&onFind?v:'popular'})
 const[rows,setRows]=useState<any[]>([]),[page,setPage]=useState(1),[more,setMore]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[adding,setAdding]=useState<string[]>([])
 const token=useRef(0),rowsRef=useRef<any[]>([])
 useEffect(()=>{let alive=true;engineFetch('/api/v1/sources').then((sr:any)=>{if(!alive)return;const list=(Array.isArray(sr)?sr:(sr?.anime||sr?.sources||sr?.items||[])).filter((x:any)=>x&&x.id!=null&&sourceFits(String(x.name||''),sectionOf(kind)));setSources(list);if(list.length&&!list.some((x:any)=>String(x.id)===source))setSource(String(list[0].id))}).catch((e:any)=>{if(alive){setSources([]);setError(cleanEngineError(e))}});return()=>{alive=false;token.current++}},[kind])
 const load=async(pg:number)=>{if(!source)return;const my=++token.current,key=source+':'+tab;if(pg===1){const c=discoverCache.get(key);if(c){rowsRef.current=c.rows;setRows(c.rows);setPage(c.page);setMore(c.more);setError('');return}rowsRef.current=[];setRows([])}setLoading(true);setError('')
  try{const d=await engineFetch('/api/v1/anime/'+encodeURIComponent(source)+'/'+tab+'?page='+pg);if(my!==token.current)return;const name=(sources||[]).find((x:any)=>String(x.id)===source)?.name||t('Video source');const all0=(Array.isArray(d)?d:(d?.animes||d?.results||d?.items||d?.list||[])),list=all0.filter((a:any)=>resultFits(a,sectionOf(kind))).map((a:any)=>({...a,sourceId:source,sourceName:name,thumbnail:mediaCover(a)}));const hasNext=Array.isArray(d)?all0.length>0:Boolean(d?.hasNextPage??all0.length>0)
   const base=pg===1?[]:rowsRef.current,seen=new Set(base.map((x:any)=>x.url||x.path)),all=[...base,...list.filter((x:any)=>!seen.has(x.url||x.path))];rowsRef.current=all;setRows(all);setPage(pg);setMore(hasNext&&all0.length>0);discoverCache.set(key,{rows:all,page:pg,more:hasNext&&all0.length>0})
   const missing=list.filter((a:any)=>!mediaCover(a)&&a.url).slice(0,12);if(missing.length){const enriched=await Promise.all(missing.map(enrichMediaCover));if(my!==token.current)return;{const next=rowsRef.current.map((x:any)=>{const e=enriched.find((y:any)=>(y.url||y.path)===(x.url||x.path));return e&&mediaCover(e)?{...x,...e,thumbnail:mediaCover(e)}:x});rowsRef.current=next;setRows(next);discoverCache.set(key,{rows:next,page:pg,more:hasNext&&list.length>0})}}
  }catch(e:any){if(my===token.current){const msg=cleanEngineError(e);setError(tab==='latest'&&/latest|not supported|unsupported|404/i.test(msg)?t('This source has no list of latest releases. Try Popular.'):msg)}}finally{if(my===token.current)setLoading(false)}}
 useEffect(()=>{lsSet('discoverTab:'+kind,tab);if(source&&tab!=='genres'&&tab!=='foryou'){lsSet('discoverSource:'+kind,source);load(1)}},[source,tab])
 const idOf=(a:any)=>kind==='Anime'?(a.id||a.url):kind.toLowerCase()+':'+(a.sourceId||'')+':'+(a.url||a.path)
 const inLib=(a:any)=>{const id=idOf(a),n=mediaNorm(a.title||a.name||'');return library.some(x=>x.id===id||(n&&mediaNorm(x.name||x.title||'')===n))}
 const add=async(a:any)=>{const k=a.url||a.path;setAdding(x=>[...x,k]);try{await onAdd(a)}finally{setAdding(x=>x.filter(y=>y!==k))}}
 const intro=kind==='Anime'?t('Browse what is popular or new on one of your anime sources.'):kind==='Series'?t('Browse what is popular or new on one of your series sources.'):t('Browse what is popular or new on one of your movie sources.')
 return <div className="media-search-page media-discover books-search-ui"><header><div><h1>{t('Discover')}</h1><p>{intro}</p></div></header>
  {sources&&sources.length===0&&!error&&<section className="panel lib-empty"><h2>{t('No video source installed')}</h2><p>{t('Install a source in Sources first, then come back here.')}</p></section>}
  {sources&&sources.length>0&&<div className="discover-bar"><div className="shelftabs" role="tablist" aria-label={t('Lists')}>{(onFind?['popular','latest','genres','foryou'] as const:['popular','latest'] as const).map(x=><button key={x} role="tab" aria-selected={tab===x} className={'shelftab'+(tab===x?' on':'')} onClick={()=>setTab(x)}>{x==='popular'?t('Popular'):x==='latest'?t('Latest'):x==='genres'?t('Genres'):t('For you')}</button>)}</div>{tab!=='genres'&&tab!=='foryou'&&<><label>{t('Source')}<select value={source} onChange={e=>setSource(e.target.value)}>{sources.map((x:any)=><option key={x.id} value={String(x.id)}>{x.name||x.id}{x.lang?' ('+String(x.lang).toUpperCase()+')':''}</option>)}</select></label></>}</div>}
  {tab==='genres'&&onFind&&<GenreBrowse kind={kind} library={library} onFind={onFind} onLibrary={onLibrary}/>}
  {tab==='foryou'&&onFind&&<ForYouBrowse kind={kind} library={library} onFind={onFind}/>}
  {!sources&&<div className="searchstatus running" role="status"><div className="searchstatus-text"><span className="spinner"/>{t('Loading sources…')}</div></div>}
  {tab!=='genres'&&<>{error&&<div className="anime-toast error"><NoticeText text={error}/></div>}
  {rows.length>0&&<div className="resultgrid">{rows.map((a:any,i:number)=>{const k=a.url||a.path||String(i),saved=inLib(a),busy=adding.includes(k);return <article className="resultcard" key={k}><Cover src={mediaCover(a)} name={a.title||a.name||kind}/><div className="resultmeta"><h3>{a.title||a.name||t('Untitled')}</h3><small>{a.sourceName}</small><div className="resultactions">{saved?<button className="inlib linkbtn" onClick={onLibrary}>{'✓ '+t('In your library')}</button>:<>{onWatch&&<button className="primary" onClick={()=>onWatch(a)}>{'▶ '+t('Watch')}</button>}<button className={onWatch?'':'primary'} disabled={busy} onClick={()=>add(a)}>{busy?t('Adding…'):onWatch?'＋ '+t('Add'):'＋ '+t('Add to library')}</button></>}</div></div></article>})}</div>}
  {loading&&<div className="searchstatus running" role="status"><div className="searchstatus-text"><span className="spinner"/>{t('Loading…')}</div></div>}
  {!loading&&!error&&sources&&sources.length>0&&rows.length===0&&<EmptyState icon="compass" title={t('Nothing here')} text={t('This source returned an empty list. Try another source.')}/>}
  {!loading&&more&&rows.length>0&&<div className="discover-more"><button onClick={()=>load(page+1)}>{t('Load more')}</button></div>}</>}
 </div>}
// Discover › Genres: popular titles of a genre (public catalogues), found on your sources.
function GenreBrowse({kind,library,onFind,onLibrary}:{kind:MediaKind,library:any[],onFind:(title:string)=>void,onLibrary:()=>void}){
 // In a kids profile: only the allowed genres (or, if none of them is in this catalog, every genre not for adults).
 const kidsList=parental().kids?genresFor(kind).filter(g=>genreAllowed(g,parental().genres)):genresFor(kind),list=kidsList.length?kidsList:genresFor(kind).filter(g=>genreAllowed(g,[])),[genre,setGenre]=useState(()=>{const g=lsGet('discoverGenre:'+kind)||'';return list.includes(g)?g:list[0]}),[rows,setRows]=useState<CatalogTitle[]>([]),[page,setPage]=useState(1),[loading,setLoading]=useState(false),[error,setError]=useState('')
 const token=useRef(0)
 const load=async(pg:number)=>{const my=++token.current;setLoading(true);setError('');if(pg===1)setRows([]);try{const r=await catalogByGenre(kind,genre,pg);if(my!==token.current)return;setRows(x=>pg===1?r:[...x,...r.filter(y=>!x.some(z=>z.id===y.id))]);setPage(pg)}catch(e:any){if(my===token.current)setError(t('The list of this genre could not be loaded ({e}). Check your internet connection and try again.',{e:String(e?.message||e)}))}finally{if(my===token.current)setLoading(false)}}
 useEffect(()=>{lsSet('discoverGenre:'+kind,genre);load(1)},[genre])
 const inLib=(x:CatalogTitle)=>{const names=[x.title,...x.alt].map(mediaNorm).filter(Boolean);return library.some(a=>names.includes(mediaNorm(a.name||a.title||'')))}
 return <>
  <div className="genre-chips" role="tablist" aria-label={t('Genres')}>{list.map(g=><button key={g} role="tab" aria-selected={genre===g} className={'chip'+(genre===g?' on':'')} onClick={()=>setGenre(g)}>{t(g)}</button>)}</div>
  <p className="settings-help genre-note">{kind==='Anime'?t('Popular on AniList. “Find” looks for the title on your sources.'):t('Popular on IMDb (Cinemeta catalogue). “Find” looks for the title on your sources.')}</p>
  {error&&<div className="anime-toast error"><NoticeText text={error}/></div>}
  {rows.length>0&&<div className="resultgrid">{rows.filter(x=>!kidsBlock(x)).map(x=>{const saved=inLib(x);return <article className="resultcard" key={x.id}><Cover src={x.cover} name={x.title}/><div className="resultmeta"><h3>{x.title}</h3><small>{[x.year,x.score?'★ '+x.score.toFixed(1):''].filter(Boolean).join(' · ')}</small><div className="resultactions">{saved?<button className="inlib linkbtn" onClick={onLibrary}>{'✓ '+t('In your library')}</button>:<button className="primary" onClick={()=>onFind(x.title)}>{'⌕ '+t('Find')}</button>}</div></div></article>})}</div>}
  {loading&&<div className="searchstatus running" role="status"><div className="searchstatus-text"><span className="spinner"/>{t('Loading…')}</div></div>}
  {!loading&&!error&&rows.length>0&&rows.length%30===0&&<div className="discover-more"><button onClick={()=>load(page+1)}>{t('Load more')}</button></div>}
 </>}
// Discover › For you: "Because you liked X" rows (src/lib/recommend.ts).
function ForYouBrowse({kind,library,onFind}:{kind:MediaKind,library:any[],onFind:(title:string)=>void}){
 const[groups,setGroups]=useState<ForYou[]|null>(null),[error,setError]=useState('')
 const seeds=seedsOf(library).length
 useEffect(()=>{let alive=true;setGroups(null);setError('');forYou(kind,library).then(g=>{if(alive)setGroups(g)}).catch(e=>{if(alive){setGroups([]);setError(t('The suggestions could not be loaded ({e}). Check your internet connection and try again.',{e:String(e?.message||e)}))}});return()=>{alive=false}},[kind,library.length])
 if(!seeds)return <EmptyState icon="compass" title={t('No suggestions yet')} text={t('Finish a title (shelf “Completed”) or watch a few episodes: suggestions will be based on them.')}/>
 return <>
  <p className="settings-help genre-note">{kind==='Anime'?t('Suggested by AniList users for the titles you finished or watched lately. “Find” looks for the title on your sources.'):t('Titles of the same genres, among the most watched on IMDb. “Find” looks for the title on your sources.')}</p>
  {error&&<div className="anime-toast error"><NoticeText text={error}/></div>}
  {groups===null&&<div className="searchstatus running" role="status"><div className="searchstatus-text"><span className="spinner"/>{t('Loading…')}</div></div>}
  {groups&&!groups.length&&!error&&<EmptyState icon="compass" title={t('No suggestions yet')} text={t('No suggestion was found for your titles. Finish or watch other titles, then come back.')}/>}
  {groups&&groups.map(g=>{const items=g.items.filter(x=>!kidsBlock(x));if(!items.length)return null;return <section className="foryou-group" key={g.because}><h2>{t('Because you liked {name}',{name:g.because})}</h2><div className="resultgrid">{items.map(x=><article className="resultcard" key={x.id}><Cover src={x.cover} name={x.title}/><div className="resultmeta"><h3>{x.title}</h3><small>{[x.year,x.score?'★ '+x.score.toFixed(1):''].filter(Boolean).join(' · ')}</small><div className="resultactions"><button className="primary" onClick={()=>onFind(x.title)}>{'⌕ '+t('Find')}</button></div></div></article>)}</div></section>})}
 </>}
const lastMediaSearch=new Map<string,{query:string,rows:any[],status:any}>()
export function MediaSearch({kind,query,setQuery,library,onAdd,onSources,onWatch}:{kind:MediaKind,query:string,setQuery:(q:string)=>void,library:any[],onAdd:(a:any)=>void,onSources?:()=>void,onWatch?:(a:any)=>Promise<void>|void}){
 // The last results stay while the app runs (back from a title opened from them).
 const kept=lastMediaSearch.get(kind),fresh=kept&&kept.query===query
 const[rows,setRowsState]=useState<any[]>(()=>fresh?kept!.rows:[]),[status,setStatusState]=useState<{running:boolean,checked:number,total:number,errors:number,stopped?:boolean}|null>(()=>fresh&&kept!.status?{...kept!.status,running:false}:null),[error,setError]=useState(''),[recent,setRecent]=useState<string[]>(()=>{try{return JSON.parse(lsGet('mediaRecent:'+kind)||'[]')}catch{return[]}})
 const remember=(patch:any)=>{const cur=lastMediaSearch.get(kind)||{query,rows:[],status:null};lastMediaSearch.set(kind,{...cur,query,...patch})}
 const setRows=(x:any)=>setRowsState((p:any[])=>{const v=typeof x==='function'?x(p):x;remember({rows:v});return v})
 const setStatus=(x:any)=>setStatusState((p:any)=>{const v=typeof x==='function'?x(p):x;remember({status:v});return v})
 const token=useRef(0)
 useEffect(()=>()=>{token.current++},[])
 // Installed sources of this section, for the language chips.
 const[installed,setInstalled]=useState<any[]>([])
 const[noSource,setNoSource]=useState(false)
 useEffect(()=>{setNoSource(false);engineFetch('/api/v1/sources').then((sr:any)=>{const l=(Array.isArray(sr)?sr:(sr.anime||sr.sources||sr.items||[])).filter((x:any)=>x&&x.id!=null&&sourceFits(String(x.name||''),sectionOf(kind)));setInstalled(l);setNoSource(!l.length)}).catch(()=>{})},[kind])
 const langs=useLangChoice('mediaLangs:'+kind,installed)
 // Started from Search everywhere: run right away.
 useEffect(()=>{const want=kind==='Anime'?'anime':kind==='Series'?'series':'movies';if(sessionStorage.getItem('autoSearch')===want&&query.trim()){sessionStorage.removeItem('autoSearch');setTimeout(()=>run(),0)}},[])
 const run=async(qIn?:string)=>{const q=(qIn??query).trim();if(!q)return;if(qIn!=null)setQuery(qIn);const my=++token.current;setRows([]);setError('')
  const next=[q,...recent.filter(x=>x.toLowerCase()!==q.toLowerCase())].slice(0,6);setRecent(next);lsSet('mediaRecent:'+kind,JSON.stringify(next))
  try{const sr=await engineFetch('/api/v1/sources');const sources=(Array.isArray(sr)?sr:(sr.anime||sr.sources||sr.items||[])).filter((x:any)=>x&&x.id!=null&&sourceFits(String(x.name||''),sectionOf(kind)));if(!sources.length){setNoSource(true);setStatus(null);return}setNoSource(false);const chosen=sources.filter((x:any)=>langs.fits(x));if(!chosen.length){setError(t('Choose at least one language.'));setStatus(null);return}sources.splice(0,sources.length,...chosen);setStatus({running:true,checked:0,total:sources.length,errors:0})
   let checked=0,errors=0;const found:any[]=[];const queue=[...sources];const workers=Array.from({length:8},async()=>{while(queue.length&&my===token.current){const src=queue.shift()!;try{const id=String(src.id);const d=await engineFetch('/api/v1/anime/'+encodeURIComponent(id)+'/search?query='+encodeURIComponent(q)+'&page=1');if(my!==token.current)return;const list=Array.isArray(d)?d:(d.animes||d.results||d.items||d.list||[]);const batch=list.filter((a:any)=>resultFits(a,sectionOf(kind))).map((a:any)=>({...a,sourceId:id,sourceName:src.name||id,sourceLang:langOf(src),thumbnail:mediaCover(a)}));found.push(...batch);setRows([...found]);const missing=batch.filter((a:any)=>!mediaCover(a)&&a.url).slice(0,8);if(missing.length){const enriched=await Promise.all(missing.map(enrichMediaCover));if(my!==token.current)return;for(const e of enriched){const j=found.findIndex((x:any)=>x.sourceId===e.sourceId&&(x.url||x.path)===(e.url||e.path));if(j>=0)found[j]={...found[j],...e,thumbnail:mediaCover(e)}}setRows([...found])}}catch{errors++}checked++;setStatus({running:true,checked,total:sources.length,errors})}})
   await Promise.all(workers);if(my===token.current)setStatus({running:false,checked,total:sources.length,errors})
  }catch(e:any){setError(e.message||String(e));setStatus(null)}}
 const stop=()=>{token.current++;setStatus(x=>x?{...x,running:false,stopped:true}:x)}
 const qn=mediaNorm(query),words=qn.split(' ').filter(Boolean),groups=new Map<string,any[]>()
 for(const a of rows){const title=mediaNorm(a.title||a.name||'');if(!title||!words.every(w=>title.includes(w)))continue;if(!groups.has(title))groups.set(title,[]);groups.get(title)!.push(a)}
 const results=Array.from(groups.entries()).map(([key,hits])=>({key,hits,primary:hits[0],score:key===qn?100:key.startsWith(qn)?90:key.includes(qn)?80:60})).sort((a,b)=>b.score-a.score||b.hits.length-a.hits.length)
 const pct=status?.total?Math.round(status.checked/status.total*100):0
 return <div className="media-search-page books-search-ui"><header><div><h1>{t('Find a title everywhere')}</h1><p>{kind==='Anime'?t('Anime: search all your video sources at once.'):kind==='Series'?t('Series: search all your video sources at once.'):t('Movies: search all your video sources at once.')}</p></div></header>
  {noSource&&<div className="panel no-source" role="status"><b>{t('No source installed yet')}</b><p>{t('Searching needs at least one video source. Install the recommended pack in Sources: it takes a few seconds.')}</p>{onSources&&<button className="primary" onClick={onSources}>{t('Open Sources')}</button>}</div>}
  <form className="searchbar search-main" onSubmit={e=>{e.preventDefault();status?.running?stop():run()}}><input placeholder={kind==='Anime'?t('Title, e.g. Solo Leveling or Frieren'):kind==='Series'?t('Title, e.g. The Bear or Lanterns'):t('Title, e.g. Dune or Iron Man')} value={query} onChange={e=>setQuery(e.target.value)} aria-label={t('Search')}/><button type="submit" className={status?.running?'stopbtn':'primary'} disabled={!status?.running&&!query.trim()}>{status?.running?t('Stop'):t('Search')}</button></form>
  <LangBar choice={langs} noun="search"/>
  {!status&&!error&&<section className="panel"><h2>{t('Search tips')}</h2><Help className="" text={t('Type the title as it is usually written in English. Results from all your installed video sources are grouped by title; the first source that answers is used to play.')}/></section>}
  {!status&&recent.length>0&&<div className="recent-searches"><small>{t('Recent searches')}</small>{recent.map(q=><button className="chip" key={q} onClick={()=>run(q)}>{q}</button>)}</div>}
  {status&&<div className={'searchstatus'+(status.running?' running':'')} role="status"><div className="searchstatus-text">{status.running?<><span className="spinner"/>{t('Searching {done} / {total} sources…',{done:status.checked,total:status.total})}</>:status.stopped?t('Search stopped after {done} of {total} sources.',{done:status.checked,total:status.total}):t('Search finished: {total} sources checked.',{total:status.total})}<b>{plural(results.length,'{n} title found','{n} titles found')}</b>{status.errors>0&&<small>{plural(status.errors,'{n} source did not answer.','{n} sources did not answer.')}</small>}</div><div className="libbar"><span style={{width:pct+'%'}}/></div></div>}
  {error&&<div className="anime-toast error"><NoticeText text={error}/></div>}
  {status&&!status.running&&results.length===0&&!error&&<EmptyState title={t('No title found')} text={t('Check the spelling or try a shorter title.')}/>}
  {results.length>0&&<section><div className="media-results-head"><div><h2>{t('Search results')}</h2><p>{plural(results.length,'{n} unique title from the sources checked.','{n} unique titles from the sources checked.')}</p></div></div><div className="resultgrid">{results.map(({key,hits,primary})=>{const id=(kind==='Anime'?(primary.id||primary.url):kind.toLowerCase()+':'+(primary.sourceId||'')+':'+(primary.url||primary.path||key));const saved=library.some(x=>x.id===id||mediaNorm(x.name||x.title)===key);return <article className="resultcard" key={key}><Cover src={mediaCover(primary)} name={primary.title||primary.name||kind}/><div className="resultmeta"><h3>{primary.title||primary.name||t('Untitled')}</h3><small>{plural(hits.length,'{n} source','{n} sources')} · {primary.sourceName||t('Video source')}</small>{(()=>{const ls=[...new Set(hits.map((h:any)=>h.sourceLang).filter((l:any)=>l&&l!=='?'))] as string[];return ls.length?<div className="result-langs">{ls.map(l=><span key={l} className="lang-tag">{langName(l)}</span>)}</div>:null})()}<div className="resultactions">{saved?<span className="inlib">{'✓ '+t('In your library')}</span>:(()=>{const item={...primary,alternates:hits.slice(1).map((x:any)=>({sourceId:String(x.sourceId||''),sourceName:x.sourceName||'Video source',url:x.url||x.path,name:x.title||x.name})).filter((x:any)=>x.sourceId&&x.url)};return <>{onWatch&&<button className="primary" onClick={()=>onWatch(item)}>{'▶ '+t('Watch')}</button>}<button className={onWatch?'':'primary'} onClick={()=>onAdd(item)}>{onWatch?'＋ '+t('Add'):'＋ '+t('Add to library')}</button></>})()}{hits.length>1&&<details className="othersources"><summary>{plural(hits.length-1,'{n} other source','{n} other sources')}</summary><div>{hits.slice(1).map((x:any,i:number)=><span className="media-source-chip" key={(x.sourceId||'s')+i}>{x.sourceName||'Video source'}</span>)}</div></details>}</div></div></article>})}</div></section>}
 </div>}
// Extension descriptions often embed Markdown metadata ("**Type:** Movie **Score:** ★ 6.6
// ... ![Backdrop](url)"). Split it into a clean synopsis and labelled facts.
export const MEDIA_STATUS:Record<string,string>={'1':'Ongoing','2':'Finished','3':'Licensed','4':'Publishing finished','5':'Cancelled','6':'On hiatus'}
export const factLabel=(k:string)=>(({'Type':t('Type'),'Score':t('Score'),'Tagline':t('Tagline'),'Release Date':t('Release date'),'First Air Date':t('First air date'),'Last Air Date':t('Last air date'),'Country':t('Country'),'Runtime':t('Runtime')} as Record<string,string>)[k]||k)
export function parseMediaDescription(raw:string){const text=String(raw||'').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]*)\]\((?:https?:)?[^)]*\)/g,'');const first=text.search(/\*\*[^*\n]{1,40}:\*\*/);const synopsis=(first<0?text:text.slice(0,first)).replace(/\s+/g,' ').trim();const facts:[string,string][]=[];if(first>=0){for(const m of text.slice(first).matchAll(/\*\*([^*\n]{1,40}):\*\*\s*([\s\S]*?)(?=\s*\*\*[^*\n]{1,40}:\*\*|$)/g)){const key=m[1].trim();const value=m[2].replace(/\*+/g,'').replace(/\s+/g,' ').trim();if(value&&!/^(official site|imdb|backdrop)$/i.test(key))facts.push([factLabel(key),value])}}return{synopsis,facts}}
export function MediaFacts({item}:{item:any}){const parsed=parseMediaDescription(item.description||item.summary||item.synopsis||item.plot||'');const desc=parsed.synopsis;const genres=Array.isArray(item.genre)?item.genre:Array.isArray(item.genres)?item.genres:String(item.genre||item.genres||'').split(',').filter(Boolean);const status=item.status!=null&&item.status!==''&&String(item.status)!=='0'?(MEDIA_STATUS[String(item.status)]?t(MEDIA_STATUS[String(item.status)]):String(item.status)):'';const facts=[...parsed.facts,[t('Status'),status],[t('Studio / author'),item.author],[t('Artist'),item.artist]].filter((x:any)=>x[1]);if(!desc&&!genres.length&&!facts.length)return null;return <section className="panel media-info no-cover"><div className="media-info-body">{desc&&<p className="media-description">{desc}</p>}{genres.length>0&&<div className="media-genres">{genres.map((g:any,i:number)=><span key={String(g)+i}>{String(g).trim()}</span>)}</div>}{facts.length>0&&<dl>{facts.map((f:any)=><React.Fragment key={f[0]}><dt>{f[0]}</dt><dd>{String(f[1])}</dd></React.Fragment>)}</dl>}</div></section>}
// Books-style hero for media detail pages: big cover, title, source line,
// progress and the main "Continue / Start" action (same layout as NovelDetail).
export function MediaHero({item,kicker,subtitle,progress,note,actions}:{item:any,kicker:string,subtitle:string,progress?:number,note?:string,actions?:any}){return <section className="novelhead media-hero"><div className="novelhead-cover"><Cover src={mediaCover(item)} name={item.name||item.title||'Media'}/></div><div className="novelhead-meta"><span className="media-kicker">{kicker}</span><h1>{item.name||item.title}</h1><p>{subtitle}</p>{progress!=null&&<div className="libbar"><span style={{width:Math.max(0,Math.min(100,progress))+'%'}}/></div>}{note&&<small>{note}</small>}{actions&&<div className="libraryactions">{actions}</div>}</div></section>}
// What "Continue" plays: the last episode watched if it was not finished, else the
// next one; 'done' when the last episode was finished (then: look for the next season).
// Genres as a clean list, whatever the source gives ("Action, Drama", ["Action"]…).
export function genreList(g:any):string[]{const raw=Array.isArray(g)?g:typeof g==='string'?g.split(/[,;|\/]+/):[];const out:string[]=[];for(const x of raw){const v=String(x||'').trim().replace(/\s+/g,' ');if(v&&v.length<40&&!out.some(o=>o.toLowerCase()===v.toLowerCase()))out.push(v.charAt(0).toUpperCase()+v.slice(1))}return out}
export function continueTarget(prefix:string,media:any,eps:any[]):{kind:'start'|'continue'|'next'|'done',index:number}{
 const li=lastEpisodeIndex(media,eps);if(li<0)return{kind:'start',index:0}
 const ep=eps[li],p=readMediaPos(prefix+String(media?.id||media?.url||media?.name)+':'+String(ep?.url||ep?.path||ep?.number||ep?.name||li))
 const finished=!!p&&(p.done||p.d>0&&p.t/p.d>=0.92)
 if(!finished)return{kind:'continue',index:li}
 return li+1<eps.length?{kind:'next',index:li+1}:{kind:'done',index:li}}
// "Show S2", "Show Season 2", "Show 2nd Season", "Show II" -> base name and season number.
export function seasonOfTitle(name:string):{base:string,season:number}{
 const s=String(name||'').replace(/\s*\(\d{4}\)\s*/g,' ').trim()
 const m=/^(.*?)[\s:–-]+(?:(?:season|saison|temporada|staffel)\s*(\d+)|s(\d+)|(\d+)(?:st|nd|rd|th)\s+season|part\s*(\d+))\s*$/i.exec(s)
 if(m){const n=Number(m[2]||m[3]||m[4]||m[5]);return{base:m[1].trim()||s,season:n||1}}
 const r=/^(.*?)\s+(II|III|IV|V)$/.exec(s);if(r)return{base:r[1],season:{II:2,III:3,IV:4,V:5}[r[2] as 'II']||1}
 return{base:s,season:1}}
export function nextSeasonQuery(name:string,eps:any[]=[]){const{base,season}=seasonOfTitle(name);const fromEps=Math.max(0,...eps.map((e:any)=>seasonNo(e)||0));return base+' season '+(Math.max(season,fromEps||1)+1)}
export function lastEpisodeIndex(media:any,eps:any[]){const key=lsGet('lastEp:'+String(media?.id||media?.url||media?.name));if(!key)return -1;return eps.findIndex((e:any)=>String(e?.url||e?.path||e?.name||'')===key)}


// ---- Choose the video source of a title ------------------------------------------
// The title's own source and the others it was found on ("alternates"); more can be
// looked for. Choosing one opens the title from it (its progress and place in the
// library stay); the next episodes then come from it.
export type AltSource={sourceId:string,sourceName:string,url:string,name?:string,checked?:boolean}
export async function findOnOtherSources(kind:MediaKind,title:string,known:AltSource[],onProgress?:(done:number,total:number)=>void,ref:{year?:number,episodes?:number}={}):Promise<AltSource[]>{
 const sr:any=await engineFetch('/api/v1/sources');const sources=(Array.isArray(sr)?sr:(sr.anime||sr.sources||sr.items||[])).filter((x:any)=>x&&x.id!=null&&sourceFits(String(x.name||''),sectionOf(kind)))
 const have=new Set(known.map(k=>String(k.sourceId))),todo=sources.filter((x:any)=>!have.has(String(x.id))),found:AltSource[]=[];let done=0
 // The title's other names (other languages, other spellings): each is searched in turn.
 const names=await altTitles(kind,title,ref.year).catch(()=>[searchQuery(title)||title])
 const wants=names.map(n=>titleInfo(n,ref.year)),want=wants[0]
 const best=(name:string,year?:number)=>{const got=titleInfo(name,year);return Math.max(...wants.map(w=>matchScore(w,got)))}
 const queue=[...todo];await Promise.all(Array.from({length:6},async()=>{while(queue.length){const src=queue.shift()!;try{
  const sid=encodeURIComponent(String(src.id))
  // An exact name wins; a name with a subtitle is only kept if no other name finds an exact one.
  let hit=false,maybe:AltSource|null=null
  for(const query of names){if(hit)break
  const d:any=await engineFetch('/api/v1/anime/'+sid+'/search?query='+encodeURIComponent(query)+'&page=1').catch(()=>[]);const list=Array.isArray(d)?d:(d?.animes||d?.results||d?.items||d?.list||[])
  const ranked=list.map((a:any)=>({a,score:best(String(a.title||a.name||''),yearOf(a.year,a.releaseDate,a.release_date))})).filter((r:any)=>r.score>0&&(r.a.url||r.a.path)).sort((x:any,y:any)=>y.score-x.score).slice(0,3)
  for(const{a,score}of ranked){
   // Checked against the title's details: the year, and film or series (episode count).
   const url=a.url||a.path
   const[det,eps]=await Promise.all([engineFetch('/api/v1/anime/'+sid+'/details?url='+encodeURIComponent(url)).catch(()=>null),engineFetch('/api/v1/anime/'+sid+'/episodes?url='+encodeURIComponent(url)).then((e:any)=>Array.isArray(e)?e:(e?.episodes||e?.items||e?.list||[])).catch(()=>null)])
   const gotYear=yearOf(a.year,det?.year,det?.releaseDate,det?.release_date,a.title,a.name,det?.title,det?.description)
   if(want.year&&gotYear&&Math.abs(want.year-gotYear)>1)continue
   const n=Array.isArray(eps)?eps.length:undefined
   if(n===0)continue
   if(n!=null&&kind==='Movie'&&n>3)continue
   if(n!=null&&kind!=='Movie'&&(ref.episodes||0)>1&&n<2)continue
   // A name with a subtitle on one side only counts when the year or the episodes agree.
   const sameYear=!!(want.year&&gotYear&&Math.abs(want.year-gotYear)<=1)
   const sameEps=kind!=='Movie'&&n!=null&&(ref.episodes||0)>1&&Math.abs(n-(ref.episodes||0))<=Math.max(2,Math.round((ref.episodes||0)*.1))
   if(score<100&&!sameYear&&!sameEps)continue
   const alt={sourceId:String(src.id),sourceName:String(src.name||src.id),url,name:String(a.title||a.name||''),checked:true}
   if(score>=100){found.push(alt);hit=true;break}
   if(!maybe)maybe=alt}}
  if(!hit&&maybe)found.push(maybe)
 }catch{}finally{done++;onProgress?.(done,todo.length)}}}))
 return found.sort((a,b)=>a.sourceName.localeCompare(b.sourceName))}
// The year and episode count of a title of the library, to compare with other sources.
export function titleRef(item:any){const eps=Array.isArray(item?.episodes)?item.episodes.length:Number(item?.episodes)||0;return{year:yearOf(item?.year,item?.releaseDate,item?.name,item?.title,item?.description),episodes:eps||undefined}}
export function SourcePicker({kind,item,onPick,onFound}:{kind:MediaKind,item:any,onPick:(alt:AltSource)=>void,onFound:(alts:AltSource[])=>void}){
 const own:AltSource={sourceId:String(item.sourceId||''),sourceName:String(item.sourceName||item.source||t('Video source')),url:item.url||item.path}
 // Alternates found by an older, looser search that are another title are left out.
 const alts:AltSource[]=(Array.isArray(item.alternates)?item.alternates:[]).filter((a:any)=>a&&a.sourceId&&a.url&&String(a.sourceId)!==own.sourceId&&(a.checked||!a.name||sameTitle(String(item.name||item.title||''),String(a.name))>0))
 const[busy,setBusy]=useState<{done:number,total:number}|null>(null),[msg,setMsg]=useState('')
 const more=async()=>{setMsg('');setBusy({done:0,total:0});try{const ref=titleRef(item);if(!ref.year&&own.sourceId&&own.url){try{const d:any=await engineFetch('/api/v1/anime/'+encodeURIComponent(own.sourceId)+'/details?url='+encodeURIComponent(own.url));ref.year=yearOf(d?.year,d?.releaseDate,d?.release_date,d?.title,d?.description)}catch{}}
  const f=await findOnOtherSources(kind,String(item.name||item.title||''),[own,...alts],(done,total)=>setBusy({done,total}),ref);onFound(f);setMsg(f.length?plural(f.length,'Found on {n} more source.','Found on {n} more sources.'):t('Not found on your other sources.'))}catch(e:any){setMsg(cleanEngineError(e))}finally{setBusy(null)}}
 return <div className="source-picker"><label>{t('Source')}<select value={own.sourceId} onChange={e=>{const a=alts.find(x=>x.sourceId===e.target.value);if(a)onPick(a)}}><option value={own.sourceId}>{own.sourceName}</option>{alts.map(a=><option key={a.sourceId+a.url} value={a.sourceId}>{a.name&&mediaNorm(a.name)!==mediaNorm(item.name||item.title||'')?a.sourceName+' — '+a.name:a.sourceName}</option>)}</select></label>
  <button disabled={!!busy} onClick={more}>{busy?t('Looking… {done}/{total}',{done:busy.done,total:busy.total||'?'}):t('Find on other sources')}</button>{msg&&<small role="status">{msg}</small>}</div>}
