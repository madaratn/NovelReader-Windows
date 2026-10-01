import React,{useEffect,useRef,useState}from'react'
import{t,plural,getLang}from'../i18n'
import{lsGet,lsSet}from'../lib/util'

// ---- Reading statistics ------------------------------------------------------------
export type DayStat={c:number,s:number}
export const dayKey=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
export function readStats():Record<string,DayStat>{try{return JSON.parse(lsGet('readingStats')||'{}')||{}}catch{return{}}}
export function bumpStats(patch:{c?:number,s?:number}){const all=readStats(),k=dayKey(),d=all[k]||{c:0,s:0};d.c+=patch.c||0;d.s+=patch.s||0;all[k]=d;const keys=Object.keys(all).sort();for(const old of keys.slice(0,Math.max(0,keys.length-400)))delete all[old];lsSet('readingStats',JSON.stringify(all))}
export let lastActivity=Date.now();export const markActivity=()=>{lastActivity=Date.now()}
export const fmtDuration=(sec:number)=>{const m=Math.round(sec/60);if(m<60)return t('{n} min',{n:m});const h=Math.floor(m/60),r=m%60;return r?t('{h} h {m} min',{h,m:r}):t('{h} h',{h})}
export function ReadingStats(){
 const[open,setOpen]=useState(()=>lsGet('statsOpen')!=='0'),[hover,setHover]=useState<number|null>(null)
 const all=readStats()
 const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const k=dayKey(d);return{date:d,key:k,...(all[k]||{c:0,s:0})}})
 const week={c:days.reduce((a,d)=>a+d.c,0),s:days.reduce((a,d)=>a+d.s,0)}
 let streak=0;{const d=new Date();if(!(all[dayKey(d)]?.c||0)&&!((all[dayKey(d)]?.s||0)>=60))d.setDate(d.getDate()-1);for(;;){const x=all[dayKey(d)];if(x&&(x.c>0||x.s>=60)){streak++;d.setDate(d.getDate()-1)}else break}}
 if(!Object.keys(all).length)return null
 const max=Math.max(1,...days.map(d=>d.c))
 const label=(d:typeof days[number])=>d.date.toLocaleDateString(getLang(),{weekday:'long',day:'numeric',month:'short'})+' · '+plural(d.c,'{n} chapter','{n} chapters')+(d.s>=60?' · '+fmtDuration(d.s):'')
 return <section className="panel stats">
  <button className="stats-head" aria-expanded={open} onClick={()=>{setOpen(!open);lsSet('statsOpen',open?'0':'1')}}><span>{t('Your reading this week')}</span><small>{plural(week.c,'{n} chapter','{n} chapters')} · {fmtDuration(week.s)}</small><span className="stats-chev" aria-hidden="true">{open?'▾':'▸'}</span></button>
  {open&&<div className="stats-body">
   <div className="stats-tiles">
    <div><b>{week.c}</b><small>{t('chapters in 7 days')}</small></div>
    <div><b>{fmtDuration(week.s)}</b><small>{t('reading time in 7 days')}</small></div>
    <div><b>{streak}</b><small>{plural(streak,'day in a row','days in a row')}</small></div>
   </div>
   <figure className="stats-chart" aria-label={t('Chapters read per day, last 7 days')}>
    <div className="stats-bars" onMouseLeave={()=>setHover(null)}>
     {days.map((d,i)=><button key={d.key} className={'stats-bar'+(hover===i?' on':'')} onMouseEnter={()=>setHover(i)} onFocus={()=>setHover(i)} onBlur={()=>setHover(null)} aria-label={label(d)}>
      <span className="stats-fill" style={{height:d.c?Math.max(4,d.c/max*100)+'%':'0'}}/>
      <span className="stats-day">{d.date.toLocaleDateString(getLang(),{weekday:'short'})}</span>
     </button>)}
    </div>
    {hover!=null&&<div className="stats-tip" role="status" style={{left:((hover+0.5)/7*100)+'%'}}>{label(days[hover])}</div>}
   </figure>
  </div>}
 </section>
}
