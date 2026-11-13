// Release calendar: the next episodes of the anime and series in the library, day by
// day (src/lib/airing.ts), and the next one on a title's page.
import React,{useEffect,useState}from'react'
import{t,getLang}from'../i18n'
import{upcoming,nextEpisodes,type Airing,type AiringKind}from'../lib/airing'

const dayOf=(ms:number)=>{const d=new Date(ms);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
const time=(ms:number)=>new Date(ms).toLocaleTimeString(getLang(),{hour:'2-digit',minute:'2-digit'})
export function dayLabel(ms:number){const d=dayOf(ms),now=Date.now();if(d===dayOf(now))return t('Today');if(d===dayOf(now+86400e3))return t('Tomorrow');if(d===dayOf(now-86400e3))return t('Yesterday');return new Date(ms).toLocaleDateString(getLang(),{weekday:'long',day:'numeric',month:'long'})}
export function untilLabel(ms:number){const left=ms-Date.now();if(left<=0)return t('out');const h=Math.round(left/3600e3);if(h<1)return t('in {n} min',{n:Math.max(1,Math.round(left/60e3))});if(h<36)return t('in {n} h',{n:h});return t('in {n} days',{n:Math.round(left/86400e3)})}
export const episodeLabel=(a:{episode:number,season?:number,kind?:AiringKind})=>a.season&&a.kind==='series'?t('S{s} · Ep. {n}',{s:a.season,n:a.episode}):t('Ep. {n}',{n:a.episode})

export function CalendarPage({libs,onOpen}:{libs:{anime:any[],series:any[]},onOpen:(kind:AiringKind,item:any)=>void}){
 const[list,setList]=useState<Airing[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[filter,setFilter]=useState<'all'|AiringKind>('all')
 const load=(force=false)=>{setBusy(true);setError('');upcoming(libs,14,force).then(setList).catch(e=>{setError(String(e?.message||e));setList(l=>l||[])}).finally(()=>setBusy(false))}
 useEffect(()=>{load()},[libs.anime.length,libs.series.length])
 const count=libs.anime.length+libs.series.length
 const shown=(list||[]).filter(a=>filter==='all'||a.kind===filter)
 const days:{day:string,at:number,items:Airing[]}[]=[]
 for(const a of shown){const d=dayOf(a.at),last=days[days.length-1];if(last&&last.day===d)last.items.push(a);else days.push({day:d,at:a.at,items:[a]})}
 const find=(a:Airing)=>(a.kind==='anime'?libs.anime:libs.series).find(m=>String(m.id||m.url||m.path||m.name)===a.itemId)
 return <div className="calendar-page">
  <header><div><h1>{t('Release calendar')}</h1><p>{t('The next episodes of the anime and series in your libraries, for the next two weeks. Times are in your time zone.')}</p></div><button disabled={busy} onClick={()=>load(true)}>{busy?t('Checking…'):t('Refresh')}</button></header>
  {count===0?<p className="settings-help">{t('Add anime or series to your libraries to see when their next episodes come out.')}</p>:<>
  <div className="shelf-tabs" role="tablist">{(['all','anime','series'] as const).map(k=><button key={k} role="tab" aria-selected={filter===k} className={'shelftab'+(filter===k?' active':'')} onClick={()=>setFilter(k)}>{k==='all'?t('All'):k==='anime'?t('Anime'):t('Series')}</button>)}</div>
  {error&&<p className="settings-help" role="status">{t('The release dates could not be fetched right now ({error}).',{error})}</p>}
  {list===null?<p className="settings-help" role="status">{t('Checking…')}</p>:days.length===0?<p className="settings-help">{t('No episode announced for your titles in the next two weeks.')}</p>:
  <div className="calendar-days">{days.map(d=><section key={d.day} className="calendar-day"><h2>{dayLabel(d.at)}</h2><ul>{d.items.map((a,i)=>{const item=find(a);return <li key={a.kind+a.itemId+i}>
   <button className="calendar-item" disabled={!item} onClick={()=>item&&onOpen(a.kind,item)}>
    {a.cover?<img src={a.cover} alt="" loading="lazy"/>:<span className="calendar-noimg" aria-hidden="true"/>}
    <span className="calendar-text"><strong>{a.title}</strong><small>{episodeLabel(a)}{a.name?' · '+a.name:''}</small></span>
    <span className="calendar-when"><b>{time(a.at)}</b><small>{untilLabel(a.at)}</small></span>
   </button></li>})}</ul></section>)}</div>}
  </>}
 </div>
}

// On a title's page: "Next episode: Ep. 6 · Friday 20 November at 17:00 (in 3 days)".
export function NextAiring({kind,item}:{kind:AiringKind,item:any}){
 const[next,setNext]=useState<{episode:number,season?:number,at:number}|null>(null)
 useEffect(()=>{let alive=true;setNext(null);if(!item)return
  nextEpisodes(kind,[item]).then(m=>{const n=[...m.values()][0]?.find(x=>x.at>Date.now()-3600e3);if(alive&&n)setNext(n)}).catch(()=>{})
  return()=>{alive=false}},[kind,item?.id,item?.name])
 if(!next)return null
 return <p className="next-airing" role="status">{'📅 '+t('Next episode: {ep} · {day} at {time} ({until})',{ep:episodeLabel({...next,kind}),day:dayLabel(next.at),time:time(next.at),until:untilLabel(next.at)})}</p>
}
