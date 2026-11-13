import React,{useEffect,useRef,useState}from'react'
import{t,plural,getLang}from'../i18n'
import type{Plugin}from'../lib/types'
import{lsGet,lsSet,timeAgo}from'../lib/util'
import{EmptyState,Help,Cover,NoticeText}from'../ui/common'
import{BOOK_DEAD_DAYS,bookAsideReason,bookSetAside,keepBookSource,loadBookStatus,noteBookResult}from'../lib/book-status'

// ---- Global search (novels, manhwa, manhua, manga) ------------------------------
export type SearchHit={plugin:Plugin,novel:any}
export type SearchGroup={key:string,title:string,cover:string,hits:SearchHit[],score:number}
export const normTitle=(x:string)=>String(x||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()
export function preferredLang(l:string){const v=String(l||'').toLowerCase();return /^en|english|anglais/.test(v)||/multi|all/.test(v)||(getLang()==='fr'&&/^fr|french|fran/.test(v))}
const lastSearch:{query:string,hits:SearchHit[],status:any}={query:'',hits:[],status:null}
export function NovelSearch({query,setQuery,plugins,ensurePlugins,library,onAdd,onOpen,onPreview}:{query:string,setQuery:(q:string)=>void,plugins:Plugin[],ensurePlugins:()=>Promise<Plugin[]>,library:any[],onAdd:(h:SearchHit)=>Promise<any>,onOpen:(item:any)=>void,onPreview?:(h:SearchHit)=>Promise<void>}){
 // The last results are kept while the app runs: coming back from a title opened
 // from them shows them again instead of an empty page.
 const[hits,setHitsState]=useState<SearchHit[]>(()=>lastSearch.query===query?lastSearch.hits:[]),[status,setStatusState]=useState<{running:boolean,checked:number,total:number,errors:number,query:string,stopped?:boolean}|null>(()=>lastSearch.query===query&&lastSearch.status?{...lastSearch.status,running:false}:null),[err,setErr]=useState('')
 const setHits=(h:SearchHit[])=>{lastSearch.hits=h;lastSearch.query=query;setHitsState(h)}
 const setStatus=(x:any)=>{setStatusState((prev:any)=>{const v=typeof x==='function'?x(prev):x;lastSearch.status=v;return v})}
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
  // The source list may have just been loaded: work out the default languages from it.
  const sel=langs??[...new Set(list.map(pl=>String(pl.lang||'?')))].filter(preferredLang)
  const targets=list.filter(pl=>sel.includes(String(pl.lang||'?')))
  if(!targets.length){setErr(t('Choose at least one language.'));return}
  const nextRecent=[q,...recent.filter(r=>r.toLowerCase()!==q.toLowerCase())].slice(0,6);setRecent(nextRecent);lsSet('recentSearches',JSON.stringify(nextRecent))
  let checked=0,errors=0;const found:SearchHit[]=[],queue=[...targets],words=normTitle(q).split(' ').filter(Boolean)
  setStatus({running:true,checked,total:targets.length,errors,query:q})
  const worker=async()=>{while(queue.length&&token===runToken.current){const plugin=queue.shift()!
   const t0=Date.now()
   try{const results=await window.novelReader.searchPlugin(plugin,q);recordHealth(plugin.id,true,Date.now()-t0);if(token!==runToken.current)return
    const ok=(results||[]).filter((n:any)=>{const nt=normTitle(n?.name);return nt&&words.every(w=>nt.includes(w))})
    if(ok.length){ok.forEach((novel:any)=>found.push({plugin,novel}));setHits([...found])}
   }catch{errors++;recordHealth(plugin.id,false)}
   if(token!==runToken.current)return
   checked++;setStatus(st=>st&&{...st,checked,errors})}}
  await Promise.all(Array.from({length:8},worker))
  if(token===runToken.current)setStatus(st=>st&&{...st,running:false})
 }
 // Started from Search everywhere: run right away.
 useEffect(()=>{if(sessionStorage.getItem('autoSearch')==='books'&&query.trim()){sessionStorage.removeItem('autoSearch');run()}},[])
 const stop=()=>{runToken.current++;setStatus(st=>st&&{...st,running:false,stopped:true})}
 // Group the same title found on several sources.
 const groups:SearchGroup[]=[];const byKey=new Map<string,SearchGroup>();const qn=normTitle(status?.query||query)
 for(const h of hits){const key=normTitle(h.novel.name);let g=byKey.get(key);if(!g){g={key,title:h.novel.name,cover:h.novel.cover||'',hits:[],score:key===qn?2:key.startsWith(qn)?1:0};byKey.set(key,g);groups.push(g)}if(!g.cover&&h.novel.cover)g.cover=h.novel.cover;g.hits.push(h)}
 groups.sort((a,b)=>b.score-a.score||b.hits.length-a.hits.length)
 const inLibrary=(h:SearchHit)=>library.find(x=>x.id===h.plugin.id+':'+h.novel.path)
 // Read without adding: the title opens as it is (it can be added from its page).
 const preview=async(h:SearchHit)=>{if(!onPreview)return;const id='read:'+h.plugin.id+':'+h.novel.path;setAdding(id);setErr('');try{await onPreview(h)}catch(e:any){setErr(t('Could not open this title:')+' '+String(e?.message||e))}finally{setAdding('')}}
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
  {status&&!status.running&&groups.length===0&&<EmptyState title={t('No title found')} text={t('Check the spelling, try a shorter title, or select more languages.')} action={selected.length<allLangs.length?t('Select all languages'):undefined} onAction={()=>setAllLangs(true)}/>}
  {groups.length>0&&<section className="resultgrid">{groups.map(g=>{const owned=g.hits.map(inLibrary).find(Boolean);const first=g.hits[0];const firstId=first.plugin.id+':'+first.novel.path
   return <article className="resultcard" key={g.key}>
    <Cover src={g.cover} name={g.title}/>
    <div className="resultmeta"><h3 title={g.title}>{g.title}</h3>
     <small>{plural(g.hits.length,'Found on {n} source','Found on {n} sources')}</small>
     <div className="resultactions">{owned?<><span className="inlib">{t('In your library ✓')}</span><button onClick={()=>onOpen(owned)}>{t('Open')}</button></>:<>{onPreview&&<button className="primary" disabled={!!adding} onClick={()=>preview(first)}>{adding==='read:'+firstId?t('Opening…'):t('Read')}</button>}<button className={onPreview?'':'primary'} disabled={!!adding} onClick={()=>add(first)}>{adding===firstId?t('Adding…'):onPreview?'＋ '+t('Add'):t('Add from {source}',{source:first.plugin.name})}</button></>}</div>
     {g.hits.length>1&&!owned&&<details className="othersources"><summary>{t('Other sources')}</summary><div>{g.hits.slice(1).map(h=>{const id=h.plugin.id+':'+h.novel.path;return <button key={id} className="chip" disabled={!!adding} onClick={()=>add(h)}>{adding===id?t('Adding…'):h.plugin.name} <small>{h.plugin.lang}</small></button>})}</div></details>}
    </div></article>})}</section>}
 </>
}

// ---- Source health ---------------------------------------------------------------
export type Health={ok:boolean,at:number,ms?:number}
export function readHealth():Record<string,Health>{try{return JSON.parse(lsGet('sourceHealth')||'{}')||{}}catch{return{}}}
export let healthCache:Record<string,Health>|null=null,healthTimer:any=null
export function recordHealth(id:string,ok:boolean,ms?:number){noteBookResult(id,ok);healthCache=healthCache||readHealth();healthCache[id]={ok,at:Date.now(),ms};clearTimeout(healthTimer);healthTimer=setTimeout(()=>{lsSet('sourceHealth',JSON.stringify(healthCache));healthCache=null},300)}
export async function probeSource(plugin:Plugin):Promise<Health>{const t0=Date.now();try{await Promise.race([window.novelReader.searchPlugin(plugin,'the'),new Promise((_,rej)=>setTimeout(()=>rej(Error('timeout')),15000))]);const h={ok:true,at:Date.now(),ms:Date.now()-t0};recordHealth(plugin.id,true,h.ms);return h}catch{recordHealth(plugin.id,false);return{ok:false,at:Date.now()}}}
export function SourcesPage({plugins,ensurePlugins,onRefresh,refreshing,error}:{plugins:Plugin[],ensurePlugins:()=>Promise<Plugin[]>,onRefresh:()=>void,refreshing:boolean,error:string}){
 const[filter,setFilter]=useState(''),[state,setState]=useState<'all'|'ok'|'bad'|'untested'>('all'),[health,setHealth]=useState<Record<string,Health>>(readHealth),[testing,setTesting]=useState<Record<string,boolean>>({}),[bulk,setBulk]=useState<{done:number,total:number}|null>(null)
 const cancel=useRef(0),[,bumpAside]=useState(0)
 useEffect(()=>{const f=()=>bumpAside(x=>x+1);window.addEventListener('nr-book-scan',f);loadBookStatus().catch(()=>{});return()=>window.removeEventListener('nr-book-scan',f)},[])
 const aside=plugins.filter(p=>bookSetAside(p.id))
 useEffect(()=>{if(!plugins.length)ensurePlugins().catch(()=>{});const iv=setInterval(()=>setHealth(readHealth()),2000);return()=>{clearInterval(iv);cancel.current++}},[])
 const statusOf=(p:Plugin)=>{const h=health[p.id];return !h?'untested':h.ok?'ok':'bad'}
 const myLangs:string[]=(()=>{try{const x=JSON.parse(lsGet('searchLangs')||'null');if(Array.isArray(x))return x}catch{}return [...new Set(plugins.map(p=>String(p.lang||'?')))].filter(preferredLang)})()
 const q=filter.trim().toLowerCase()
 const shown=plugins.filter(p=>!q||(p.name+' '+p.lang+' '+p.site).toLowerCase().includes(q)).filter(p=>state==='all'||statusOf(p)===state)
 const counts={ok:plugins.filter(p=>statusOf(p)==='ok').length,bad:plugins.filter(p=>statusOf(p)==='bad').length,untested:plugins.filter(p=>statusOf(p)==='untested').length}
 const testOne=async(p:Plugin)=>{setTesting(x=>({...x,[p.id]:true}));const h=await probeSource(p);setHealth(x=>({...x,[p.id]:h}));setTesting(x=>{const n={...x};delete n[p.id];return n})}
 const testMine=async()=>{const token=++cancel.current;const list=plugins.filter(p=>myLangs.includes(String(p.lang||'?')));const queue=[...list];let done=0;setBulk({done,total:list.length})
  const worker=async()=>{while(queue.length&&token===cancel.current){const p=queue.shift()!;setTesting(x=>({...x,[p.id]:true}));const h=await probeSource(p);if(token!==cancel.current)return;setHealth(x=>({...x,[p.id]:h}));setTesting(x=>{const n={...x};delete n[p.id];return n});done++;setBulk({done,total:list.length})}}
  await Promise.all(Array.from({length:8},worker));if(token===cancel.current)setBulk(null)}
 const host=(u:string)=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return u||''}}
 return <>
  <header><div><h1>{t('Sources')}</h1><p>{t('The sites the search looks in. Nothing to install: here you see which ones work.')}</p></div></header>
  <div className="sources-actions">
   {bulk?<button className="stopbtn" onClick={()=>{cancel.current++;setBulk(null);setTesting({})}}>{t('Stop')} · {bulk.done}/{bulk.total}</button>:<button className="primary" disabled={!plugins.length} onClick={testMine}>{t('Test the sources in my languages ({n})',{n:plugins.filter(p=>myLangs.includes(String(p.lang||'?'))).length})}</button>}
   <button onClick={onRefresh} disabled={refreshing}>{refreshing?t('Refreshing…'):t('Refresh the list')}</button>
   <small>{t('Official LNReader repository · {n} sources loaded',{n:plugins.length||'—'})}</small>
  </div>
  {aside.length>0&&<details className="panel set-aside book-aside"><summary><b>{plural(aside.length,'{n} source set aside','{n} sources set aside')}</b><small>{t('Checked automatically: sources that stopped working are left out of search and Discover, and come back by themselves when they work again.')}</small></summary>
   <div className="set-aside-list">{aside.slice(0,300).map(p=><span key={p.id} className="set-aside-item"><b>{p.name}</b><small>{bookAsideReason(p.id)==='check'?t('down for {n} days or more',{n:BOOK_DEAD_DAYS}):t('failed here several days in a row')}</small><button onClick={()=>keepBookSource(p.id)}>{t('Use anyway')}</button></span>)}</div></details>}
  {bulk&&<div className="searchstatus running" role="status"><div className="searchstatus-text"><span className="spinner" aria-hidden="true"/>{t('Testing {done} / {total} sources…',{done:bulk.done,total:bulk.total})}</div><div className="libbar"><span style={{width:(bulk.total?bulk.done/bulk.total*100:0)+'%'}}/></div></div>}
  <div className="lib-toolbar"><div className="searchbar"><input placeholder={t('Filter sources or language…')} value={filter} onChange={e=>setFilter(e.target.value)} aria-label={t('Filter sources or language…')}/></div></div>
  <div className="shelftabs" role="tablist">{([['all',t('All'),plugins.length],['ok',t('Working'),counts.ok],['bad',t('Failing'),counts.bad],['untested',t('Not tested yet'),counts.untested]] as [any,string,number][]).map(([id,label,n])=><button key={id} role="tab" aria-selected={state===id} className={'shelftab'+(state===id?' on':'')} onClick={()=>setState(id)}>{label} <small>{n}</small></button>)}</div>
  {error&&<div className="anime-toast error search-toast"><NoticeText text={t('Repository error:')+' '+error}/></div>}
  {plugins.length===0&&!error?<section className="panel"><p><span className="spinner" aria-hidden="true"/>{t('Loading sources…')}</p></section>:
  <section className="sourcelist">{shown.slice(0,400).map(p=>{const st=statusOf(p),h=health[p.id];return <article className="sourcerow" key={p.id}>
   {p.iconUrl?<img src={p.iconUrl} alt="" loading="lazy" onError={e=>{(e.currentTarget as HTMLImageElement).style.visibility='hidden'}}/>:<span className="srcicon"/>}
   <div className="sourcerow-main"><b>{p.name}</b><small>{p.lang} · {host(p.site)} · v{p.version}</small></div>
   <span className={'health '+st}>{testing[p.id]?<><span className="spinner" aria-hidden="true"/>{t('Testing…')}</>:st==='ok'?<>● {t('Works')}<small>{timeAgo(h!.at)}</small></>:st==='bad'?<>● {t('Not responding')}<small>{timeAgo(h!.at)}</small></>:<>○ {t('Not tested yet')}</>}</span>
   <button disabled={!!testing[p.id]} onClick={()=>testOne(p)}>{t('Test')}</button>
  </article>})}{shown.length===0&&<Help text={t('No source matches.')}/>}</section>}
 </>
}

// ---- Discover (books): Popular / Latest lists of one LNReader source ------------
const novelDiscoverCache=new Map<string,{rows:any[],page:number,more:boolean}>()
export function NovelDiscover({plugins,ensurePlugins,library,onAdd,onOpen,onPreview}:{plugins:Plugin[],ensurePlugins:()=>Promise<Plugin[]>,library:any[],onAdd:(h:SearchHit)=>Promise<any>,onOpen:(item:any)=>void,onPreview?:(h:SearchHit)=>Promise<void>}){
 const[list,setList]=useState<Plugin[]>(plugins),[source,setSource]=useState(()=>lsGet('novelDiscoverSource')||''),[tab,setTab]=useState<'popular'|'latest'>(()=>lsGet('novelDiscoverTab')==='latest'?'latest':'popular')
 const[rows,setRows]=useState<any[]>([]),[page,setPage]=useState(1),[more,setMore]=useState(false),[loading,setLoading]=useState(false),[err,setErr]=useState(''),[adding,setAdding]=useState('')
 const token=useRef(0),rowsRef=useRef<any[]>([])
 // Genres: the source's own genre filter, when it has one.
 const[genres,setGenres]=useState<{label:string,value:any}[]>([]),[genre,setGenre]=useState('')
 useEffect(()=>{if(plugins.length){setList(plugins);return}ensurePlugins().then(setList).catch(e=>setErr(t('Could not load the source list:')+' '+String(e?.message||e)))},[plugins])
 const choices=list.filter(p=>preferredLang(String(p.lang||''))).sort((a,b)=>String(a.name).localeCompare(String(b.name)))
 useEffect(()=>{if(choices.length&&!choices.some(p=>p.id===source))setSource(choices[0].id)},[list])
 const plugin=list.find(p=>p.id===source)
 useEffect(()=>{setGenres([]);const saved=lsGet('novelDiscoverGenre:'+source)||'';setGenre(saved);if(!plugin||!window.novelReader.pluginGenres)return;let live=true;window.novelReader.pluginGenres(plugin).then(g=>{if(!live)return;setGenres(g||[]);if(saved&&!(g||[]).some(x=>String(x.value)===saved))setGenre('')}).catch(()=>{});return()=>{live=false}},[source,list.length])
 const load=async(pg:number)=>{if(!plugin||!window.novelReader.popularPlugin)return;const my=++token.current,key=plugin.id+':'+(genre?'genre:'+genre:tab);if(pg===1){const c=novelDiscoverCache.get(key);if(c){rowsRef.current=c.rows;setRows(c.rows);setPage(c.page);setMore(c.more);setErr('');return}rowsRef.current=[];setRows([])}setLoading(true);setErr('')
  try{const gv=genre?(genres.find(x=>String(x.value)===genre)?.value??genre):'';const res=await window.novelReader.popularPlugin(plugin,pg,tab==='latest',gv);if(my!==token.current)return;const base=pg===1?[]:rowsRef.current,seen=new Set(base.map((x:any)=>x.path)),all=[...base,...(res||[]).filter((x:any)=>x&&x.path&&!seen.has(x.path))];rowsRef.current=all;setRows(all);const m=(res||[]).length>0;setPage(pg);setMore(m);novelDiscoverCache.set(key,{rows:all,page:pg,more:m})}
  catch(e:any){if(my===token.current)setErr(/popularNovels unavailable/.test(String(e?.message))?t('This source has no list to browse. Try another one.'):String(e?.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,''))}finally{if(my===token.current)setLoading(false)}}
 useEffect(()=>{if(plugin){lsSet('novelDiscoverSource',plugin.id);lsSet('novelDiscoverTab',tab);lsSet('novelDiscoverGenre:'+plugin.id,genre);load(1)}},[source,tab,list.length,genre])
 const saved=(n:any)=>plugin&&library.find(x=>x.id===plugin.id+':'+n.path)
 const add=async(n:any)=>{if(!plugin)return;setAdding(n.path);setErr('');try{await onAdd({plugin,novel:n})}catch(e:any){setErr(t('Could not add novel:')+' '+String(e?.message||e))}finally{setAdding('')}}
 return <div className="media-search-page media-discover books-search-ui"><header><div><h1>{t('Discover')}</h1><p>{t('Browse what is popular or new on one of your book sources.')}</p></div></header>
  {choices.length>0&&<div className="discover-bar"><div className="shelftabs" role="tablist" aria-label={t('Lists')}>{(['popular','latest'] as const).map(x=><button key={x} role="tab" aria-selected={tab===x} className={'shelftab'+(tab===x?' on':'')} onClick={()=>setTab(x)}>{x==='popular'?t('Popular'):t('Latest')}</button>)}</div><label>{t('Source')}<select value={source} onChange={e=>setSource(e.target.value)}>{choices.map(p=><option key={p.id} value={p.id}>{p.name}{p.lang?' ('+p.lang+')':''}</option>)}</select></label>{genres.length>0&&<label>{t('Genre')}<select value={genre} onChange={e=>setGenre(e.target.value)}><option value="">{t('All genres')}</option>{genres.map(g=><option key={String(g.value)} value={String(g.value)}>{g.label}</option>)}</select></label>}</div>}
  {!list.length&&!err&&<div className="searchstatus running" role="status"><div className="searchstatus-text"><span className="spinner"/>{t('Loading sources…')}</div></div>}
  {err&&<div className="anime-toast error"><NoticeText text={err}/></div>}
  {rows.length>0&&<div className="resultgrid">{rows.map((n:any)=>{const item=saved(n);return <article className="resultcard" key={n.path}><Cover src={n.cover||''} name={n.name||'?'}/><div className="resultmeta"><h3>{n.name}</h3><small>{plugin?.name}</small><div className="resultactions">{item?<button className="inlib" onClick={()=>onOpen(item)}>{'✓ '+t('Open')}</button>:<>{onPreview&&plugin&&<button className="primary" disabled={!!adding} onClick={async()=>{setAdding('read:'+n.path);setErr('');try{await onPreview({plugin,novel:n})}catch(e:any){setErr(t('Could not open this title:')+' '+String(e?.message||e))}finally{setAdding('')}}}>{adding==='read:'+n.path?t('Opening…'):t('Read')}</button>}<button className={onPreview?'':'primary'} disabled={!!adding} onClick={()=>add(n)}>{adding===n.path?t('Adding…'):(onPreview?'＋ '+t('Add'):'＋ '+t('Add to library'))}</button></>}</div></div></article>})}</div>}
  {loading&&<div className="searchstatus running" role="status"><div className="searchstatus-text"><span className="spinner"/>{t('Loading…')}</div></div>}
  {!loading&&!err&&plugin&&rows.length===0&&<EmptyState icon="compass" title={t('Nothing here')} text={t('This source returned an empty list. Try another source.')}/>}
  {!loading&&more&&rows.length>0&&<div className="discover-more"><button onClick={()=>load(page+1)}>{t('Load more')}</button></div>}
 </div>
}
