// "Your year": reading and watching of the current year on this device, from the
// figures the app already keeps (readingStats, watchStats, history).
import React,{useMemo}from'react'
import{t,plural,getLang}from'../i18n'
import{readHistory,type HistoryLine}from'../lib/history'
import{readStats,fmtDuration}from'./stats'
import{readWatchStats}from'../lib/media'
import{Cover}from'../ui/common'

type Libs=Record<'books'|'anime'|'series'|'movies',any[]>
export type YearSummary={year:number,readS:number,chapters:number,watchS:number,episodes:number,activeDays:number,streak:number,bestMonth:number,bestMonthS:number,top:{line:HistoryLine,days:number,item:any}[],genres:{name:string,n:number}[]}

const idOf=(m:any)=>String(m?.id||m?.url||m?.name||'')
export function yearSummary(libs:Libs,year=new Date().getFullYear()):YearSummary{
 const pre=year+'-',reading=readStats(),watching=readWatchStats()
 const days=new Map<string,number>()
 let readS=0,chapters=0,watchS=0,episodes=0
 for(const[k,v]of Object.entries(reading))if(k.startsWith(pre)){readS+=Number(v?.s)||0;chapters+=Number(v?.c)||0;days.set(k,(days.get(k)||0)+(Number(v?.s)||0)+(Number(v?.c)||0)*60)}
 for(const[k,v]of Object.entries(watching as Record<string,any>))if(k.startsWith(pre)){watchS+=Number(v?.s)||0;episodes+=Number(v?.e)||0;days.set(k,(days.get(k)||0)+(Number(v?.s)||0))}
 // Active day: at least a minute, or a chapter.
 const active=[...days.entries()].filter(([,s])=>s>=60).map(([k])=>k).sort()
 let streak=0,run=0,prev=''
 for(const d of active){const p=new Date(d+'T12:00:00');p.setDate(p.getDate()-1);const y=p.getFullYear()+'-'+String(p.getMonth()+1).padStart(2,'0')+'-'+String(p.getDate()).padStart(2,'0');run=prev===y?run+1:1;streak=Math.max(streak,run);prev=d}
 const months=new Array(12).fill(0);for(const[k,s]of days)if(k.startsWith(pre))months[Number(k.slice(5,7))-1]+=s
 const bestMonth=months.indexOf(Math.max(...months))
 // Titles followed on the most different days.
 const lines=readHistory().filter(x=>new Date(x.at).getFullYear()===year)
 const byTitle=new Map<string,{line:HistoryLine,days:Set<string>}>()
 for(const x of lines){const k=x.kind+':'+x.id;const e=byTitle.get(k)||{line:x,days:new Set<string>()};e.days.add(new Date(x.at).toDateString());byTitle.set(k,e)}
 const find=(x:HistoryLine)=>(libs[x.kind]||[]).find(m=>idOf(m)===String(x.id)||String(m.id)===String(x.id))
 const top=[...byTitle.values()].sort((a,b)=>b.days.size-a.days.size).slice(0,5).map(e=>({line:e.line,days:e.days.size,item:find(e.line)}))
 const g=new Map<string,number>()
 for(const e of byTitle.values()){const m=find(e.line);for(const x of(Array.isArray(m?.genres)?m.genres:[]))g.set(String(x),(g.get(String(x))||0)+e.days.size)}
 const genres=[...g.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,n])=>({name,n}))
 return{year,readS,chapters,watchS,episodes,activeDays:active.length,streak,bestMonth,bestMonthS:months[bestMonth]||0,top,genres}
}

export function YearPage({libs,onBack,onOpen}:{libs:Libs,onBack:()=>void,onOpen:(line:HistoryLine,item:any)=>void}){
 const y=useMemo(()=>yearSummary(libs),[libs.books.length,libs.anime.length,libs.series.length,libs.movies.length])
 const empty=!y.readS&&!y.chapters&&!y.watchS&&!y.episodes&&!y.top.length
 const month=new Date(y.year,y.bestMonth,15).toLocaleDateString(getLang(),{month:'long'})
 const kind=(k:string)=>k==='books'?t('Book'):k==='anime'?t('Anime'):k==='series'?t('Series'):t('Movie')
 return <div className="year-page"><header><div><button className="backbtn" onClick={onBack}>{'← '+t('Back')}</button><h1>{t('Your year {y}',{y:y.year})}</h1><p>{t('What you read and watched this year on this device.')}</p></div></header>
  {empty?<p className="settings-help">{t('Nothing yet this year. Read or watch something and come back!')}</p>:<>
  <div className="year-tiles">
   <div><b>{fmtDuration(y.readS)}</b><small>{t('of reading')}</small></div>
   <div><b>{y.chapters}</b><small>{plural(y.chapters,'chapter read','chapters read')}</small></div>
   <div><b>{fmtDuration(y.watchS)}</b><small>{t('of watching')}</small></div>
   <div><b>{y.episodes}</b><small>{plural(y.episodes,'episode finished','episodes finished')}</small></div>
   <div><b>{y.activeDays}</b><small>{plural(y.activeDays,'day with reading or watching','days with reading or watching')}</small></div>
   <div><b>{y.streak}</b><small>{plural(y.streak,'day in a row, at most','days in a row, at most')}</small></div>
  </div>
  {y.bestMonthS>0&&<p className="year-line">{t('Your busiest month: {m} ({d}).',{m:month,d:fmtDuration(y.bestMonthS)})}</p>}
  {y.top.length>0&&<section className="year-block"><h2>{t('What you followed the most')}</h2><ol className="year-top">{y.top.map((x,i)=><li key={x.line.kind+x.line.id}>
   <span className="year-rank">{i+1}</span><Cover src={String(x.item?.cover||x.item?.thumbnail||'')} name={x.line.name}/>
   <span className="year-title">{x.item?<button className="linkbtn" onClick={()=>onOpen(x.line,x.item)}>{x.line.name}</button>:<b>{x.line.name}</b>}<small>{kind(x.line.kind)+' · '+plural(x.days,'{n} day','{n} days')}</small></span></li>)}</ol></section>}
  {y.genres.length>0&&<section className="year-block"><h2>{t('Your favourite genres')}</h2><div className="year-genres">{y.genres.map(g=><span key={g.name} className="chip on">{t(g.name)}</span>)}</div></section>}
  </>}
 </div>
}
