import React,{useEffect,useRef,useState}from'react'
import{t,plural,getLang}from'../i18n'
import type{Plugin}from'../lib/types'
import{lsGet,lsSet,timeAgo}from'../lib/util'
import{Cover,NoticeText}from'../ui/common'

// ---- Global search (novels, manhwa, manhua, manga) ------------------------------
export type SearchHit={plugin:Plugin,novel:any}
export type SearchGroup={key:string,title:string,cover:string,hits:SearchHit[],score:number}
export const normTitle=(x:string)=>String(x||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()
export function preferredLang(l:string){const v=String(l||'').toLowerCase();return /^en|english|anglais/.test(v)||/multi|all/.test(v)||(getLang()==='fr'&&/^fr|french|fran/.test(v))}
export function NovelSearch({query,setQuery,plugins,ensurePlugins,library,onAdd,onOpen}:{query:string,setQuery:(q:string)=>void,plugins:Plugin[],ensurePlugins:()=>Promise<Plugin[]>,library:any[],onAdd:(h:SearchHit)=>Promise<any>,onOpen:(item:any)=>void}){
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

// ---- Source health ---------------------------------------------------------------
export type Health={ok:boolean,at:number,ms?:number}
export function readHealth():Record<string,Health>{try{return JSON.parse(lsGet('sourceHealth')||'{}')||{}}catch{return{}}}
export let healthCache:Record<string,Health>|null=null,healthTimer:any=null
export function recordHealth(id:string,ok:boolean,ms?:number){healthCache=healthCache||readHealth();healthCache[id]={ok,at:Date.now(),ms};clearTimeout(healthTimer);healthTimer=setTimeout(()=>{lsSet('sourceHealth',JSON.stringify(healthCache));healthCache=null},300)}
export async function probeSource(plugin:Plugin):Promise<Health>{const t0=Date.now();try{await Promise.race([window.novelReader.searchPlugin(plugin,'the'),new Promise((_,rej)=>setTimeout(()=>rej(Error('timeout')),15000))]);const h={ok:true,at:Date.now(),ms:Date.now()-t0};recordHealth(plugin.id,true,h.ms);return h}catch{recordHealth(plugin.id,false);return{ok:false,at:Date.now()}}}
export function SourcesPage({plugins,ensurePlugins,onRefresh,refreshing,error}:{plugins:Plugin[],ensurePlugins:()=>Promise<Plugin[]>,onRefresh:()=>void,refreshing:boolean,error:string}){
 const[filter,setFilter]=useState(''),[state,setState]=useState<'all'|'ok'|'bad'|'untested'>('all'),[health,setHealth]=useState<Record<string,Health>>(readHealth),[testing,setTesting]=useState<Record<string,boolean>>({}),[bulk,setBulk]=useState<{done:number,total:number}|null>(null)
 const cancel=useRef(0)
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
  <header><div><h1>{t('Sources')}</h1><p>{t('The sites Global Search looks in. You do not need to install anything: search uses them directly. Here you can see which ones work.')}</p></div></header>
  <div className="sources-actions">
   {bulk?<button className="stopbtn" onClick={()=>{cancel.current++;setBulk(null);setTesting({})}}>{t('Stop')} · {bulk.done}/{bulk.total}</button>:<button className="primary" disabled={!plugins.length} onClick={testMine}>{t('Test the sources in my languages ({n})',{n:plugins.filter(p=>myLangs.includes(String(p.lang||'?'))).length})}</button>}
   <button onClick={onRefresh} disabled={refreshing}>{refreshing?t('Refreshing…'):t('Refresh the list')}</button>
   <small>{t('Official LNReader repository · {n} sources loaded',{n:plugins.length||'—'})}</small>
  </div>
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
  </article>})}{shown.length===0&&<p className="settings-help">{t('No source matches.')}</p>}</section>}
 </>
}
