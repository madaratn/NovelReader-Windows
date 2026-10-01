import React,{useEffect,useRef,useState}from'react'
import{t,plural}from'../i18n'
import{ReadingStats}from'../features/stats'
import{lsGet,lsSet,timeAgo}from'../lib/util'
import{Cover}from'../ui/common'

// ---- Novel library ----------------------------------------------------------
export type ReadingState={index:number,path?:string,scroll?:number,at?:number}
export const readingOf=(id:string):ReadingState|null=>{try{const r=JSON.parse(localStorage.getItem('reading:'+id)||'null');return r&&Number.isInteger(r.index)?r:null}catch{return null}}
export type Shelf='reading'|'plan'|'completed'|'dropped'
export const SHELVES:{id:Shelf,label:string}[]=[{id:'reading',label:'Reading'},{id:'plan',label:'Plan to read'},{id:'completed',label:'Completed'},{id:'dropped',label:'Dropped'}]
// Explicit choice wins; otherwise inferred from reading progress.
export function shelfOf(n:any,r:ReadingState|null,total:number):Shelf{if(SHELVES.some(x=>x.id===n.shelf))return n.shelf;if(!r)return 'plan';return total>0&&r.index+1>=total?'completed':'reading'}
export type LibSort='recent'|'added'|'title'|'unread'
export type Removed={novel:any,position:number,reading:string|null}
export type UpdateState={running:boolean,done:number,total:number,found:number,failed:number,at:number}
export function NovelLibrary({library,updates,onCheckUpdates,onOpen,onDetails,onRemove,onRestore,onSearch,onShelf}:{library:any[],updates:UpdateState,onCheckUpdates:()=>void,onShelf:(n:any,shelf:Shelf)=>void,onOpen:(n:any)=>void,onDetails:(n:any)=>void,onRemove:(n:any)=>Removed,onRestore:(r:Removed)=>void,onSearch:()=>void}){
 const[shelf,setShelf]=useState<'all'|Shelf>(()=>{const v=lsGet('libraryShelf');return v&&SHELVES.some(x=>x.id===v)?v as Shelf:'all'}),[filter,setFilter]=useState(''),[sort,setSort]=useState<LibSort>(()=>(lsGet('librarySort') as LibSort)||'recent'),[undo,setUndo]=useState<Removed|null>(null)
 useEffect(()=>{if(!undo)return;const t=setTimeout(()=>setUndo(null),7000);return()=>clearTimeout(t)},[undo])
 const rows=library.map(n=>{const r=readingOf(n.id),total=Number(n.chapterCount)||n.chapters?.length||0,done=r?r.index+1:0;return{n,r,total,done,left:Math.max(0,total-done),shelf:shelfOf(n,r,total)}})
 const q=filter.trim().toLowerCase()
 const counts=Object.fromEntries(SHELVES.map(x=>[x.id,rows.filter(r=>r.shelf===x.id).length])) as Record<Shelf,number>
 const shown=rows.filter(x=>shelf==='all'||x.shelf===shelf).filter(x=>!q||(x.n.name+' '+(x.n.author||'')+' '+(x.n.source?.name||'')).toLowerCase().includes(q)).sort((a,b)=>sort==='title'?String(a.n.name).localeCompare(String(b.n.name)):sort==='added'?(b.n.addedAt||0)-(a.n.addedAt||0):sort==='unread'?b.left-a.left:((Number(b.n.newChapters)>0?1:0)-(Number(a.n.newChapters)>0?1:0))||((b.r?.at||0)-(a.r?.at||0))||((b.n.addedAt||0)-(a.n.addedAt||0)))
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
   {!q&&<ReadingStats/>}
   <div className="shelftabs" role="tablist" aria-label={t('Shelves')}>{([['all',t('All'),rows.length]] as [string,string,number][]).concat(SHELVES.map(x=>[x.id,t(x.label),counts[x.id]] as [string,string,number])).map(([id,label,n])=><button key={id} role="tab" aria-selected={shelf===id} className={'shelftab'+(shelf===id?' on':'')} onClick={()=>{setShelf(id as any);lsSet('libraryShelf',id)}}>{label} <small>{n}</small></button>)}</div>
   <div className="lib-toolbar"><div className="searchbar"><input placeholder={t('Filter by title, author or source…')} value={filter} onChange={e=>setFilter(e.target.value)} aria-label={t('Filter by title, author or source…')}/></div>
    <button className="lib-update" disabled={updates.running} onClick={onCheckUpdates} title={updates.at?t('Last check: {when}',{when:timeAgo(updates.at)}):undefined}>{updates.running?t('Checking {done}/{total}…',{done:updates.done,total:updates.total}):t('Check for new chapters')}</button>
    <label className="lib-sort">{t('Sort')}<select value={sort} onChange={e=>{const v=e.target.value as LibSort;setSort(v);lsSet('librarySort',v)}}><option value="recent">{t('Recently read')}</option><option value="added">{t('Recently added')}</option><option value="title">{t('Title A–Z')}</option><option value="unread">{t('Most unread')}</option></select></label></div>
   {!updates.running&&updates.at>0&&updates.total>0&&<p className="lib-update-status" role="status">{updates.found?plural(updates.found,'{n} novel has new chapters.','{n} novels have new chapters.'):t('Everything is up to date.')}{updates.failed?' '+plural(updates.failed,'{n} source did not answer.','{n} sources did not answer.'):''}</p>}
   {shown.length===0?<section className="panel"><p>{q?t('No novel matches “{q}”.',{q:filter}):t('No novel on this shelf yet.')}</p></section>:<section className="libgrid">{shown.map(({n,r,total,done,left,shelf:sh})=><article className="libcard" key={n.id}>
    <button className="libcard-cover" onClick={()=>onDetails(n)} aria-label={t('Chapters of {name}',{name:n.name})} title={t('Show chapters')}><Cover src={n.cover} name={n.name}/></button>
    <div className="libcard-meta">
     <h2 title={n.name}><button className="libtitle" onClick={()=>onDetails(n)}>{n.name}</button></h2>
     {Number(n.newChapters)>0&&<span className="newbadge">{t('+{n} new',{n:n.newChapters})}</span>}
     <p>{[n.author,n.source?.name].filter(Boolean).join(' · ')}</p>
     <div className="libbar" title={t('{done} of {total} chapters',{done,total})}><span style={{width:(total?Math.min(100,done/total*100):0)+'%'}}/></div>
     <small>{r?`${done} / ${total} · ${t('{n} left',{n:left})}${r.at?' · '+timeAgo(r.at):''}`:plural(total,'{n} chapter','{n} chapters')+' · '+t('not started')}</small>
     <div className="libraryactions"><button className="primary" onClick={()=>onOpen(n)}>{r?t('Continue · Ch. {n}',{n:r.index+1}):t('Start reading')}</button><select className="shelfselect" value={sh} aria-label={t('Shelf')} title={t('Shelf')} onChange={e=>onShelf(n,e.target.value as Shelf)}>{SHELVES.map(x=><option key={x.id} value={x.id}>{t(x.label)}</option>)}</select><button className="removebtn" onClick={()=>setUndo(onRemove(n))}>{t('Remove')}</button></div>
    </div></article>)}</section>}
  </>}
  {undo&&<div className="anime-toast ok lib-undo" role="status"><span>{t('Removed “{name}”.',{name:undo.novel.name})}</span><div><button className="undo-btn" onClick={()=>{onRestore(undo);setUndo(null)}}>{t('Undo')}</button><button aria-label={t('Dismiss')} onClick={()=>setUndo(null)}>×</button></div></div>}
 </>
}

// ---- Novel detail (chapter list) ---------------------------------------------
export function NovelDetail({novel,filter,setFilter,loading,onBack,onOpenChapter,onContinue}:{novel:any,filter:string,setFilter:(v:string)=>void,loading:boolean,onBack:()=>void,onOpenChapter:(c:any,i:number)=>void,onContinue:()=>void}){
 const chapters:any[]=novel.chapters||[],total=chapters.length||Number(novel.chapterCount)||0
 const r=readingOf(novel.id),current=r?r.index:-1,done=r?r.index+1:0
 const[newestFirst,setNewestFirst]=useState(()=>lsGet('chapterOrder')==='desc'),[hideRead,setHideRead]=useState(()=>lsGet('chapterHideRead')==='1'),[clicked,setClicked]=useState(-1)
 const listRef=useRef<HTMLDivElement>(null)
 // Offline downloads
 const[offline,setOffline]=useState<Set<string>>(new Set()),[dl,setDl]=useState<{done:number,total:number,failed:number}|null>(null),[dlCount,setDlCount]=useState(()=>lsGet('offlineBatch')||'10')
 const dlToken=useRef(0)
 useEffect(()=>{window.novelReader.offlineList?.(novel.id).then(l=>setOffline(new Set(l))).catch(()=>{});return()=>{dlToken.current++}},[novel.id])
 const download=async()=>{
  const start=Math.max(0,current),targets=chapters.slice(start).filter(c=>!offline.has(c.path||c.url)).slice(0,dlCount==='all'?undefined:Number(dlCount))
  if(!targets.length)return
  const token=++dlToken.current,queue=[...targets];let done=0,failed=0;setDl({done,total:targets.length,failed})
  const worker=async()=>{while(queue.length&&token===dlToken.current){const c=queue.shift()!,cp=c.path||c.url
   try{const d:any=await window.novelReader.parseChapter(novel.source,cp);const html=typeof d==='string'?d:(d?.text||d?.content||d?.html||d?.body||'');await window.novelReader.offlineSave(novel.id,cp,String(html),novel.name);if(token!==dlToken.current)return;setOffline(prev=>{const n=new Set(prev);n.add(cp);return n})}catch{failed++}
   if(token!==dlToken.current)return;done++;setDl({done,total:targets.length,failed})}}
  await Promise.all([worker(),worker()])
  if(token===dlToken.current)setDl(st=>st&&{...st,done:st.total})
 }
 const removeDownloads=async()=>{dlToken.current++;setDl(null);await window.novelReader.offlineRemove?.(novel.id).catch(()=>{});setOffline(new Set())}
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
    <div className="offlinebar">{dl&&dl.done<dl.total?<><span className="spinner" aria-hidden="true"/><span>{t('Downloading chapters {done} / {total}…',{done:dl.done,total:dl.total})}</span><button onClick={()=>{dlToken.current++;setDl(null)}}>{t('Stop')}</button></>:<>
      <span className="offline-label">⤓ {plural(offline.size,'{n} chapter available offline','{n} chapters available offline')}{dl&&dl.failed>0?' · '+plural(dl.failed,'{n} failed','{n} failed'):''}</span>
      <select value={dlCount} aria-label={t('How many chapters to download')} onChange={e=>{setDlCount(e.target.value);lsSet('offlineBatch',e.target.value)}}><option value="10">{t('Next {n} chapters',{n:10})}</option><option value="50">{t('Next {n} chapters',{n:50})}</option><option value="all">{t('All remaining chapters')}</option></select>
      <button onClick={download} disabled={!chapters.length}>{t('Download')}</button>
      {offline.size>0&&<button className="ghostbtn" onClick={removeDownloads}>{t('Delete downloads')}</button>}</>}</div>
     <div className="libraryactions">{r?<button className="primary" disabled={loading} onClick={()=>{setClicked(-2);onContinue()}}>{loading&&clicked===-2?t('Loading…'):t('Continue · Ch. {n}',{n:current+1})}</button>:<button className="primary" disabled={loading||!chapters.length} onClick={()=>open(chapters[0],0)}>{t('Start reading')}</button>}{r&&<button onClick={()=>{if(hideRead){setHideRead(false);lsSet('chapterHideRead','0')}requestAnimationFrame(()=>jumpToCurrent())}}>{t('Show current chapter')}</button>}</div>
   </div>
  </section>
  <section className="chapterarea">
   <div className="chaptertools"><div className="searchbar"><input placeholder={t('Filter by title or chapter number…')} value={filter} onChange={e=>setFilter(e.target.value)} aria-label={t('Filter by title or chapter number…')}/></div>
    <div className="rs-seg chapter-order" role="radiogroup" aria-label={t('Order')}><button role="radio" aria-checked={!newestFirst} className={!newestFirst?'on':''} onClick={()=>{setNewestFirst(false);lsSet('chapterOrder','asc')}}>{t('Oldest first')}</button><button role="radio" aria-checked={newestFirst} className={newestFirst?'on':''} onClick={()=>{setNewestFirst(true);lsSet('chapterOrder','desc')}}>{t('Newest first')}</button></div>
    <label className="hideread"><input type="checkbox" checked={hideRead} onChange={e=>{setHideRead(e.target.checked);lsSet('chapterHideRead',e.target.checked?'1':'0')}}/> {t('Hide read')}</label></div>
   <small className="chaptercount">{rows.length===total?plural(total,'{n} chapter','{n} chapters'):t('{done} of {total} chapters',{done:rows.length,total})}</small>
   {rows.length===0?<p className="chapterempty">{t('No chapter matches.')}</p>:<div className="chapterlist" ref={listRef}>{rows.map(({c,i,label})=>{const state=i<current?'read':i===current?'current':'';return <button className={'chapterrow '+state} disabled={loading} onClick={()=>open(c,i)} key={(c.path||c.url||'chapter')+i} aria-current={state==='current'?'true':undefined}>
    <span className="chaptername">{state==='read'&&<span className="chaptercheck" aria-label={t('Read')}>✓</span>}{label}</span>{offline.has(c.path||c.url)&&<span className="offline-mark" title={t('Available offline')} aria-label={t('Available offline')}>⤓</span>}
    <small>{loading&&clicked===i?t('Loading…'):state==='current'?t('Reading · Ch. {n}',{n:i+1}):t('Ch. {n}',{n:i+1})}</small></button>})}</div>}
  </section>
 </>
}
