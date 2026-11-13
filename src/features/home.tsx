// "Continue": one screen with what is in progress in every section (books, anime,
// series, movies) and what is new in the libraries. Opened from the sidebar / the top
// bar, and shown once at start when there is something to continue.
import React,{useEffect,useMemo,useRef}from'react'
import{t,plural,getLang}from'../i18n'
import{historyDays,clearHistory,dayOf,recentTitles,readHistory,type HistoryLine}from'../lib/history'
import{Help,Cover,Icon}from'../ui/common'
import{mediaCover,readMediaPos}from'../lib/media'
import{timeAgo}from'../lib/util'
import type{QuickKind}from'./quick-search'

export type HomeItem={kind:QuickKind,item:any,name:string,sub:string,at:number,progress:number,cover:string,resume?:{url:string,next:boolean}}
const KIND:Record<QuickKind,string>={books:'Books',anime:'Anime',series:'Series',movies:'Movies'}
const read=(k:string)=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}}
const idOf=(a:any)=>String(a.id||a.url||a.name)
// Same keys as the players (features/downloads.tsx playerKey), so the bar is the real position.
const posKey=(kind:QuickKind,a:any,url:string)=>kind==='movies'?'movie:'+idOf(a):kind+':'+idOf(a)+':'+url

/** What is in progress, most recent first. Pure: reads the saved positions only. */
export function continueItems(libs:Record<QuickKind,any[]>,max=12):HomeItem[]{
 const out:HomeItem[]=[]
 for(const n of libs.books||[]){if(n.shelf==='dropped')continue;const r=read('reading:'+n.id);if(!r||!Number.isInteger(r.index)||!r.at)continue
  const total=n.chapters?.length||0,c=n.chapters?.[r.index]
  if(total&&r.index>=total-1&&(r.progress||0)>=0.98)continue // finished
  out.push({kind:'books',item:n,name:String(n.name||''),sub:String(c?.name||c?.title||t('Chapter {n}',{n:r.index+1})),at:r.at,progress:total?Math.min(1,(r.index+(r.progress||0))/total):0,cover:n.cover||''})}
 for(const kind of ['anime','series','movies'] as QuickKind[])for(const a of libs[kind]||[]){if(a.shelf==='dropped'||a.shelf==='completed')continue
  const info=read('lastEpInfo:'+idOf(a));if(!info?.url||!info.at)continue
  const pos=readMediaPos(posKey(kind,a,info.url)),count=Number(a.episodes)||0,done=!!pos?.done,hasNext=kind!=='movies'&&done&&(info.n||0)<count
  if(done&&!hasNext)continue // watched to the end, nothing after it
  const ep=kind==='movies'?'':String(info.name||(info.n?t('Episode {n}',{n:info.n}):''))
  out.push({kind,item:a,name:String(a.name||a.title||''),sub:hasNext?t('Next episode after {ep}',{ep}):ep,at:info.at,progress:!done&&pos?.d?Math.min(1,pos.t/pos.d):0,cover:mediaCover(a)||'',resume:{url:info.url,next:hasNext}})}
 return out.sort((a,b)=>b.at-a.at).slice(0,max)}
/** Titles of the libraries with new chapters / episodes. */
export function newItems(libs:Record<QuickKind,any[]>,max=12):HomeItem[]{
 const out:HomeItem[]=[]
 for(const n of libs.books||[])if(Number(n.newChapters)>0)out.push({kind:'books',item:n,name:String(n.name||''),sub:plural(Number(n.newChapters),'{n} new chapter','{n} new chapters'),at:0,progress:0,cover:n.cover||''})
 for(const kind of ['anime','series'] as QuickKind[])for(const a of libs[kind]||[])if(Number(a.newEpisodes)>0)out.push({kind,item:a,name:String(a.name||a.title||''),sub:plural(Number(a.newEpisodes),'{n} new episode','{n} new episodes'),at:0,progress:0,cover:mediaCover(a)||''})
 return out.slice(0,max)}
export const homeAtStart=()=>{try{return localStorage.getItem('homeAtStart')!=='0'}catch{return false}}

export function HomePanel({libs,onClose,onContinue,onOpen,onHistory}:{libs:Record<QuickKind,any[]>,onClose:()=>void,onContinue:(x:HomeItem)=>void,onOpen:(x:HomeItem)=>void,onHistory?:()=>void}){
 const going=useMemo(()=>continueItems(libs),[libs]),fresh=useMemo(()=>newItems(libs),[libs]),box=useRef<HTMLDivElement>(null)
 const[atStart,setAtStart]=React.useState(homeAtStart)
 // History here: only the last episode / chapter of each title; the rest is on its own page.
 const recent=useMemo(()=>recentTitles(readHistory(),5),[]),total=useMemo(()=>readHistory().length,[])
 const find=(x:HistoryLine)=>findHistoryItem(libs,x)
 useEffect(()=>{box.current?.focus()},[])
 // PC with the phone link on: a card can be sent to the phone ("continue there").
 const api=(window as any).novelReader,[canSend,setCanSend]=React.useState(false),[sent,setSent]=React.useState('')
 useEffect(()=>{api?.shareStatus?.().then((st:any)=>setCanSend(!!st?.enabled)).catch(()=>{})},[])
 const send=async(x:HomeItem)=>{try{const r=await api.shareSend({kind:x.kind,id:idOf(x.item),name:x.name,sub:x.sub,url:x.resume?.url||'',next:!!x.resume?.next});setSent(r?.phoneSeen&&Date.now()-r.phoneSeen<10*60*1000?t('Sent. Open NovelReader on the phone: it offers to continue "{name}".',{name:x.name}):t('Sent. The phone has not been seen on the Wi-Fi lately: open NovelReader on it within 10 minutes.'))}catch(e:any){setSent(String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/,''))}}
 const card=(x:HomeItem,act:(x:HomeItem)=>void,i:number)=><div key={x.kind+idOf(x.item)+i} className="home-cardwrap"><button className="home-card" onClick={()=>{act(x);onClose()}}>
  <Cover src={x.cover} name={x.name}/>
  <span className="home-meta"><small>{t(KIND[x.kind])}{x.at?' · '+timeAgo(x.at):''}</small><b>{x.name}</b><span>{x.sub}</span>{x.progress>0&&<span className="libbar"><span style={{width:Math.round(x.progress*100)+'%'}}/></span>}</span></button>{canSend&&act===onContinue&&<button className="home-send" onClick={()=>send(x)} title={t('Continue on my phone')} aria-label={t('Continue on my phone')+': '+x.name}><Icon name="phone"/></button>}</div>
 return <div className="qs-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="qs home-panel" role="dialog" aria-modal="true" aria-label={t('Continue')} tabIndex={-1} ref={box} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();onClose()}}}>
  <div className="home-head"><h2>{t('Continue')}</h2><button className="iconbtn" onClick={onClose} aria-label={t('Close')}>×</button></div>
  <div className="home-body">
   {going.length===0&&fresh.length===0&&recent.length===0&&<Help text={t('Nothing in progress yet. What you read and watch will show up here, from every section.')}/>}
   {sent&&<div className="anime-toast ok" role="status"><span>{sent}</span><button onClick={()=>setSent('')}>×</button></div>}
   {going.length>0&&<div className="home-grid">{going.map((x,i)=>card(x,onContinue,i))}</div>}
   {fresh.length>0&&<><h3>{t('New in your library')}</h3><div className="home-grid">{fresh.map((x,i)=>card(x,onOpen,i))}</div></>}
   {recent.length>0&&<><h3 className="home-history-head">{t('Recently')}{onHistory&&total>recent.length&&<button className="linkbtn" onClick={()=>{onClose();onHistory()}}>{t('Whole history')}</button>}</h3>
    <ul className="home-recent">{recent.map((x,i)=>{const item=find(x);return <li key={i}>{item?<button className="linkbtn" onClick={()=>{onOpen({kind:x.kind,item,name:x.name,sub:x.sub,at:x.at,progress:0,cover:''});onClose()}}>{x.name}</button>:<b>{x.name}</b>}<span>{[x.sub,t(KIND[x.kind])].filter(Boolean).join(' · ')}</span><small>{timeAgo(x.at)}</small></li>})}</ul></>}
  </div>
  <label className="settings-check home-start"><input type="checkbox" checked={atStart} onChange={e=>{setAtStart(e.target.checked);localStorage.setItem('homeAtStart',e.target.checked?'1':'0')}}/> {t('Show this when NovelReader starts')}</label>
 </div></div>}

const findHistoryItem=(libs:Record<QuickKind,any[]>,x:HistoryLine)=>(libs[x.kind]||[]).find((a:any)=>String(x.kind==='books'?a.id:(a.id||a.url||a.name))===x.id)
// The whole history, day by day, on its own page.
export function HistoryPage({libs,onOpen,onBack}:{libs:Record<QuickKind,any[]>,onOpen:(x:HomeItem)=>void,onBack:()=>void}){
 const[days,setDays]=React.useState(()=>historyDays()),[filter,setFilter]=React.useState<'all'|QuickKind>('all')
 const dayLabel=(day:string)=>day===dayOf(Date.now())?t('Today'):day===dayOf(Date.now()-86400e3)?t('Yesterday'):new Date(day+'T12:00:00').toLocaleDateString(getLang(),{weekday:'long',day:'numeric',month:'long'})
 const shown=days.map(d=>({...d,lines:d.lines.filter(x=>filter==='all'||x.kind===filter)})).filter(d=>d.lines.length)
 return <div className="history-page"><header><div><button className="backbtn" onClick={onBack}>{'← '+t('Back')}</button><h1>{t('History')}</h1><p>{t('What you read and watched on this device, day by day.')}</p></div>{days.length>0&&<button onClick={()=>{if(window.confirm(t('Clear the whole history? This cannot be undone.'))){clearHistory();setDays([])}}}>{t('Clear')}</button>}</header>
  {days.length>0&&<div className="shelf-tabs" role="tablist">{(['all','books','anime','series','movies'] as const).map(k=><button key={k} role="tab" aria-selected={filter===k} className={'shelftab'+(filter===k?' active':'')} onClick={()=>setFilter(k)}>{k==='all'?t('All'):t(KIND[k])}</button>)}</div>}
  {shown.length===0?<p className="settings-help">{t('Nothing yet.')}</p>:<div className="home-history">{shown.map(d=><div key={d.day}><h4>{dayLabel(d.day)}</h4><ul>{d.lines.map((x,i)=>{const item=findHistoryItem(libs,x);return <li key={i}><small>{new Date(x.at).toLocaleTimeString(getLang(),{hour:'2-digit',minute:'2-digit'})} · {t(KIND[x.kind])}</small>{item?<button className="linkbtn" onClick={()=>onOpen({kind:x.kind,item,name:x.name,sub:x.sub,at:x.at,progress:0,cover:''})}>{x.name}</button>:<b>{x.name}</b>}{x.sub&&<span>{x.sub}</span>}</li>})}</ul></div>)}</div>}
 </div>}

// ---- On the phone: what the PC sent ("Continue on my phone") ------------------
export type Incoming={at:number,kind:QuickKind,id:string,name:string,sub:string,url:string,next:boolean}
/** Asks the linked PC every few seconds (app visible) and hands over what it sent since the last look. */
export function usePcInbox(onItem:(x:Incoming)=>void){
 useEffect(()=>{if(!document.documentElement.classList.contains('android'))return
  let busy=false
  const look=async()=>{const pc=localStorage.getItem('pcEngine');if(!pc||busy||document.visibilityState!=='visible')return;busy=true
   try{const after=Number(localStorage.getItem('pcInboxAt'))||0,ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),4000)
    const r=await fetch(pc+'/nr/inbox?after='+after,{signal:ctl.signal}).finally(()=>clearTimeout(tm));if(!r.ok)return
    const box=await r.json(),items:Incoming[]=Array.isArray(box?.items)?box.items:[]
    // First look after linking: only remember the PC's clock (nothing old is offered).
    localStorage.setItem('pcInboxAt',String(items.length?Math.max(...items.map(x=>x.at)):after||Number(box?.now)||0))
    if(after&&items.length)onItem(items[items.length-1])}catch{}finally{busy=false}}
  look();const iv=setInterval(look,6000);return()=>clearInterval(iv)},[])}
