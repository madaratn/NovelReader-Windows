import React,{useEffect,useRef,useState}from'react'
import{ReportButton}from'../features/report'
import{t}from'../i18n'
import{hueOf,initials}from'../lib/util'
import{useCardView}from'../lib/card-view'

// ---- Readable error messages -------------------------------------------
// Engine errors can carry hundreds of lines of Java stack trace. Show one
// readable sentence; keep the raw text in a collapsible panel for debugging.
// Technical errors said plainly: what happened and what to do. The original text
// stays under "Technical details".
const FRIENDLY:[RegExp,string][]=[
 [/address not allowed/i,'This source tried to reach something that is not a web site, and was stopped.'],
 [/cloudflare|just a moment|captcha|webview|challenge|bot check|not a bot|ddos-guard|\b403\b/i,'This site is checking that you are not a robot. Try again in a moment, or use another source.'],
 [/enotfound|err_name_not_resolved|unknownhost|name or service not known|no address associated|name resolution/i,'This site no longer exists or has moved. Use another source.'],
 [/err_internet_disconnected|network ?error|failed to fetch|fetch failed|econnrefused|econnreset|err_connection|unable to resolve host/i,'No answer from the site. Check your internet connection, then try again.'],
 [/timeout|timed out|etimedout/i,'This site is too slow to answer. Try again, or use another source.'],
 [/certificate|cert_|\b(ssl|tls)\b/i,'The security certificate of this site is not valid. Use another source.'],
 [/unexpected token|json|cannot read propert|is not a function|nullpointer|nosuchmethod|missingfield|lateinit/i,'This source no longer understands its site (it needs an update). Use another source.'],
 [/user token|enter the token|api key|log ?in to|logged in|extension settings/i,'This source needs an account or a key. Use another source.'],
 [/\b(50\d|52\d|530)\b/,'This site is down for now. Try again later, or use another source.'],
 [/\b(404|410)\b|not found/i,'This page no longer exists on the site. Use another source.'],
]
export function friendlyError(raw:string):string{const x=String(raw||'');for(const[re,msg]of FRIENDLY)if(re.test(x))return t(msg);return''}
export function splitError(raw:string){const plain=splitErrorRaw(raw);
 // Only for messages that carry a technical tail ("Could not load video: fetch failed").
 const m=/^([^:]{3,60}:)\s+(.+)$/s.exec(plain.summary);const tail=m?m[2]+' '+plain.details:'';const nice=m&&/[a-z_]{3,}|\d{3}/i.test(m[2])?friendlyError(tail):''
 if(nice&&nice!==m![2])return{summary:m![1]+' '+nice,details:(plain.details||plain.summary)}
 // A bare network message ("Failed to fetch") gets the plain explanation too.
 if(!m&&/^(failed to fetch|fetch failed|load failed|networkerror|typeerror: (failed|network)|net::err_)/i.test(plain.summary)){const n=friendlyError(plain.summary);if(n&&n!==plain.summary)return{summary:n,details:plain.details||plain.summary}}
 return plain}
function splitErrorRaw(raw:string){let t=String(raw||'').replace(/Error invoking remote method '[^']+':\s*(Error:\s*)?/g,'').trim();const cut=t.search(/\s(Engine:|Caused by|\d{4}-\d\d-\d\dT\d\d:\d\d|at [a-z][\w$]*\.[\w$.]+\()|\s—\s|\s\|\s|\n/);let summary=(cut>0?t.slice(0,cut):t).trim();if(summary.length>240)summary=summary.slice(0,237)+'…';return{summary,details:summary===t?'':t}}
export function NoticeText({text}:{text:string}){const{summary,details}=splitError(text);const[copied,setCopied]=useState(false);return <div className="notice-text"><span>{summary}</span>{details&&<details className="notice-details"><summary>{t('Technical details')}</summary><pre>{details.replace(/\s\|\s/g,'\n')}</pre><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(details);setCopied(true);setTimeout(()=>setCopied(false),1500)}catch{}}}>{copied?t('Copied'):t('Copy details')}</button></details>}</div>}
export const ICONS:Record<string,string>={
 calendar:'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h2M14 12h2M8 16h2',
 phone:'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
 crown:'M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8z',
 lock:'M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z',
 qr:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM20 14v2.5M14 20h2.5M20 20h.01',
 signal:'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8',
 timer:'M12 9v4l2.5 2M9.5 2.5h5M12 5.5a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
 copy:'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
 micoff:'M9 9v3a3 3 0 0 0 5 2.2M15 10.5V5a3 3 0 0 0-5.7-1.3M19 10v2a7 7 0 0 1-.9 3.4M5 10v2a7 7 0 0 0 10.6 6M12 19v3M3 3l18 18',
 hangup:'M3.5 14.5c5-4.6 12-4.6 17 0l-2.4 2.8-3.4-1.7v-2.3a10 10 0 0 0-5.4 0v2.3l-3.4 1.7z',
 users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
 volume:'M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
 mute:'M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6',
 mic:'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
 camera:'M23 7l-7 5 7 5V7zM3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
 chat:'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
 link:'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
 cast:'M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6M2 20h.01',
 globe:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
 sparkles:'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z',
 alert:'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
 maximize:'M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3',
 minimize:'M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3',
 playsolid:'M7 4.5v15l12-7.5z',
 pause:'M7 4h3v16H7zM14 4h3v16h-3z',
 check:'M5 12.5l4.5 4.5L19 7.5',
 sidebar:'M4 5h16v14H4zM9.5 5v14',
 trash:'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
 more:'M4 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M10.8 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M17.6 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0',
 book:'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zm0 15A1.5 1.5 0 0 0 6.5 21H19',
 play:'M4 5h16v14H4zM10 9l5 3-5 3z',
 tv:'M3 7h18v12H3zM8 3l4 4 4-4',
 film:'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
 compass:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
 download:'M12 4v11M7 10l5 5 5-5M5 20h14',
 grid:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
 list:'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
 comics:'M4 4h16v16H4zM4 12h16M12 4v8',
 search:'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8',
 sort:'M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5',
 plug:'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4',
 folder:'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
 archive:'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
 collapse:'M15 6l-6 6 6 6',
 expand:'M9 6l6 6-6 6',
 keys:'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
 bookmark:'M6 3h12v18l-6-4-6 4z',
 gear:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'
}
// inline: sized to the text around it (in a button label, a title).
export function Icon({name,inline}:{name:string,inline?:boolean}){return <svg className={'icon'+(inline?' inline':'')} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]||''}/></svg>}
// A cover: its picture, or the initials on a colour made from the name. The same colour
// shows while the picture loads, and the picture comes in softly. A cover whose address
// changes (details that arrive later) is tried again, even after a first failure.
export function Cover({src,name}:{src?:string,name:string}){const[failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false);useEffect(()=>{setFailed(false);setLoaded(false)},[src]);const h=hueOf(name),bg=`linear-gradient(150deg,hsl(${h} 45% 32%),hsl(${(h+40)%360} 50% 18%))`;if(src&&!failed)return <img className={'libcover'+(loaded?' loaded':'')} src={src} alt="" loading="lazy" style={loaded?undefined:{background:bg}} onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>;return <div className="libcover placeholder" aria-hidden="true" data-initials={initials(name)} style={{background:bg}}/>}
// Covers or list: the two ways the libraries and Discover show their titles (lib/card-view.ts).
export function ViewToggle(){const[v,set]=useCardView();return <div className="view-toggle" role="group" aria-label={t('Display')}>{(['posters','list'] as const).map(x=><button key={x} type="button" aria-pressed={v===x} className={v===x?'on':''} onClick={()=>set(x)} title={x==='posters'?t('Covers'):t('List')} aria-label={x==='posters'?t('Covers'):t('List')}><Icon name={x==='posters'?'grid':'list'}/></button>)}</div>}
// The shapes of the cards (or rows) that are coming, while a list loads. Not announced:
// the status line beside them says "Loading…".
export function SkeletonCards({n=6,posters=false}:{n?:number,posters?:boolean}){return <div className={'resultgrid skeleton-grid'+(posters?' posters':'')} aria-hidden="true">{Array.from({length:n},(_,i)=><div className="skeleton-card" key={i}><div className="skeleton"/><div><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div></div>)}</div>}
export function SkeletonRows({n=6}:{n?:number}){return <div className="skeleton-rows" aria-hidden="true">{Array.from({length:n},(_,i)=><div className="skeleton" key={i}/>)}</div>}

// ---- Error boundary: a crashing page shows a recovery screen, not a black window
export class ErrorBoundary extends React.Component<{children:React.ReactNode,resetKey?:string,onHome?:()=>void,full?:boolean},{error:any}>{
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
   <div className="libraryactions">{this.props.onHome&&<button className="primary" onClick={()=>{this.setState({error:null});this.props.onHome!()}}>{t('Back to library')}</button>}<button className={this.props.onHome?undefined:'primary'} onClick={()=>location.reload()}>{t('Reload')}</button><ReportButton context={'UI error: '+String(e?.message||e)}/></div>
   <div className="crash-detail"><NoticeText text={t('Error:')+' '+String(e?.message||e)+' | '+detail}/></div>
  </section></div>
 }
}

// "⋯" button with a small menu of less frequent actions (library cards, player).
export function MoreMenu({label,children,className='',up=false}:{label?:string,children:React.ReactNode,className?:string,up?:boolean}){
 const[open,setOpen]=React.useState(false),ref=React.useRef<HTMLDivElement>(null),pop=React.useRef<HTMLDivElement>(null)
 // The menu opens under its button, to the left of it; near the left edge of the screen
 // (a narrow card in the first column) it is moved back inside. Near the bottom (the last
 // cards, over the phone's bottom bar) it opens upwards; with no room either way, the
 // page moves to show it whole.
 React.useLayoutEffect(()=>{const el=pop.current;if(!open||!el)return;el.style.right='';el.style.top='';el.style.bottom=''
  const over=8-el.getBoundingClientRect().left;if(over>0)el.style.right=(-over)+'px'
  if(up)return
  const edge=(sel:string,side:'top'|'bottom',none:number)=>{const b=document.querySelector(sel);const r=b?b.getBoundingClientRect():null;return r&&r.height>0?r[side]:none}
  const floor=edge('.m-bottom','top',window.innerHeight)-8,ceil=edge('.m-top','bottom',0)+8,r=el.getBoundingClientRect()
  if(r.bottom<=floor)return
  if((ref.current as HTMLElement).getBoundingClientRect().top-6-r.height>=ceil){el.style.top='auto';el.style.bottom='calc(100% + 6px)'}
  else el.scrollIntoView({block:'nearest'})},[open])
 React.useEffect(()=>{if(!open)return;const out=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false)}};document.addEventListener('mousedown',out);document.addEventListener('keydown',esc,true);return()=>{document.removeEventListener('mousedown',out);document.removeEventListener('keydown',esc,true)}},[open])
 return <div ref={ref} className={'more-menu'+(open?' open':'')+(up?' up':'')+(className?' '+className:'')}><button type="button" className="more-btn" aria-expanded={open} aria-label={label||t('More actions')} title={label||t('More actions')} onClick={()=>setOpen(o=>!o)}><Icon name="more"/></button>{open&&<div className="more-pop" ref={pop} role="group" aria-label={label||t('More actions')} onClick={e=>{if((e.target as HTMLElement).closest('button'))setOpen(false)}}>{children}</div>}</div>
}

// Help text: one plain sentence; when the text is long, the rest opens on demand
// ("More"), so a page stays short to read.
export function splitHelp(text:string):[string,string]{
 const s=String(text||'');if(s.length<=150)return[s,'']
 const m=/^(.{40,}?[.!?…])\s+(?=\S)/.exec(s);if(!m||s.length-m[1].length<30)return[s,'']
 return[m[1],s.slice(m[0].length)]}
export function Help({text,className='settings-help'}:{text:string,className?:string}){
 const[open,setOpen]=React.useState(false),[first,rest]=splitHelp(text)
 return <p className={className+(rest?' has-more':'')}>{first}{rest&&open?' '+rest:''}{rest&&<>{' '}<button type="button" className="help-more" aria-expanded={open} onClick={()=>setOpen(o=>!o)}>{open?t('Less'):t('More')}</button></>}</p>}

// An empty page says what is missing in one sentence and offers the one next step.
export function EmptyState({icon='search',title,text,action,onAction,className=''}:{icon?:string,title:string,text?:string,action?:string,onAction?:()=>void,className?:string}){
 return <section className={'panel lib-empty empty-state'+(className?' '+className:'')}><span className="empty-icon" aria-hidden="true"><Icon name={icon}/></span><h2>{title}</h2>{text&&<p>{text}</p>}{action&&onAction&&<button className="primary" onClick={onAction}>{action}</button>}</section>}

// Library: one row of genre chips (the most frequent first, the rest in "More").
// Hidden while no title has a genre yet.
export function GenreFilter({lists,value,onChange}:{lists:string[][],value:string,onChange:(g:string)=>void}){
 const counts=new Map<string,number>();for(const l of lists)for(const g of l||[])counts.set(g,(counts.get(g)||0)+1)
 if(!counts.size)return null
 const sorted=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),top=sorted.slice(0,10),rest=sorted.slice(10)
 const chip=(g:string,n:number|null,label?:string)=><button key={g||'all'} role="tab" aria-selected={value===g} className={'chip'+(value===g?' on':'')} onClick={()=>onChange(value===g&&g?'':g)}>{label||t(g)}{n!=null&&<small> {n}</small>}</button>
 return <div className="genre-chips lib-genres" role="tablist" aria-label={t('Genres')}>{chip('',null,t('All genres'))}{top.map(([g,n])=>chip(g,n))}
  {rest.length>0&&<select aria-label={t('More genres')} value={rest.some(([g])=>g===value)?value:''} onChange={e=>onChange(e.target.value)}><option value="">{t('More genres…')}</option>{rest.map(([g,n])=><option key={g} value={g}>{t(g)+' ('+n+')'}</option>)}</select>}</div>}

// Long lists (big libraries, 2,000-chapter novels): the first items are drawn at once,
// the next ones as the end of the list comes near, so the screen opens and reacts
// quickly. `reset` values start again from the top (a new filter, another shelf).
// `keep` remembers how far the list went while the app runs, so coming back to it
// (and to the place you were) shows as much as before.
const shownSoFar=new Map<string,number>()
export function useShowMore(total:number,{first=60,step=120,reset=[] as any[],keep=''}={}){
 const[limit,setLimitState]=React.useState(()=>Math.max(first,keep?shownSoFar.get(keep)||0:0))
 const setLimit=(v:number|((l:number)=>number))=>setLimitState(l=>{const n=typeof v==='function'?v(l):v;if(keep)shownSoFar.set(keep,n);return n})
 const ref=React.useRef<HTMLDivElement|null>(null),mounted=React.useRef(false)
 React.useEffect(()=>{if(!mounted.current){mounted.current=true;return}setLimit(first)},reset)
 React.useEffect(()=>{const el=ref.current;if(!el||limit>=total||typeof IntersectionObserver==='undefined'){if(typeof IntersectionObserver==='undefined')setLimit(total);return}
  const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting))setLimit(l=>Math.min(total,l+step))},{rootMargin:'1200px 0px'})
  io.observe(el);return()=>io.disconnect()},[limit,total])
 const more=limit<total?<div ref={ref} className="show-more-sentinel" aria-hidden="true"/>:null
 return{limit,more,showAll:()=>setLimit(total)}
}

/** The box that scrolls `el` (a list with its own scroll bar), or null when the page does. */
// A small window hanging from a button stays on the screen and off the side menu,
// wherever its button sits: it is pushed sideways by what would stick out.
export function useKeepInView(ref:React.RefObject<HTMLElement|null>,on:boolean){
 const place=()=>{const el=ref.current;if(!el)return
  el.style.transform='';const r=el.getBoundingClientRect(),main=document.fullscreenElement?null:document.querySelector('main')?.getBoundingClientRect()
  const lo=Math.max(8,(main?.left??0)+8),hi=window.innerWidth-8,dx=r.left<lo?Math.ceil(lo-r.left):r.right>hi?Math.floor(hi-r.right):0
  if(dx)el.style.transform='translateX('+dx+'px)'}
 React.useLayoutEffect(()=>{if(on)place()})
 React.useEffect(()=>{if(!on)return;window.addEventListener('resize',place);return()=>window.removeEventListener('resize',place)},[on])
}
export const scrollBoxOf=(el:Element|null)=>{for(let p=el?.parentElement||null;p&&p!==document.body;p=p.parentElement){const o=getComputedStyle(p).overflowY;if((o==='auto'||o==='scroll')&&p.scrollHeight>p.clientHeight+1)return p}return null}
// A long list opened in its middle (a novel at chapter 2,500 of 5,000): the rows around
// that place at once, not the thousands before it. The later ones come as the end of
// what is drawn comes near. The earlier ones come the same way in a list that has its
// own scroll bar; when the page itself scrolls (a phone), the list simply starts a little
// before that place, with a button to bring the earlier rows.
// Rows added above push nothing: what is on screen stays where it is.
export function useShowAround(total:number,{around=0,before=40,first=240,step=240,reset=[] as any[],label=''}={}){
 // (`reset` values start again around the place: a filter, another order. Done while
 // drawing, not after, so the first picture of the new list is already the right one.)
 const sig=reset.map(String).join('\u0001')
 const init=()=>{const from=Math.max(0,Math.min(around-before,total-first));return{from,to:Math.min(total,from+first),sig}}
 const[state,setWin]=React.useState(init)
 let win=state;if(state.sig!==sig){win=init();setWin(win)}
 const top=React.useRef<HTMLButtonElement|null>(null),end=React.useRef<HTMLDivElement|null>(null),keep=React.useRef<{el:Element,top:number}|null>(null)
 const earlier=()=>{const row=top.current?.nextElementSibling;if(row)keep.current={el:row,top:row.getBoundingClientRect().top};setWin(w=>({...w,from:Math.max(0,w.from-step)}))}
 React.useEffect(()=>{
  if(typeof IntersectionObserver==='undefined'){setWin(w=>({...w,from:0,to:total}));return}
  const one=top.current||end.current;if(!one)return
  const box=scrollBoxOf(one)
  const io=new IntersectionObserver(es=>{for(const e of es){if(!e.isIntersecting)continue
   if(e.target===end.current)setWin(w=>({...w,to:Math.min(total,w.to+step)}))
   else if(box)earlier()}},{root:box,rootMargin:'1000px 0px'})
  if(top.current)io.observe(top.current);if(end.current)io.observe(end.current)
  return()=>io.disconnect()},[win.from,win.to,total])
 React.useLayoutEffect(()=>{const k=keep.current;keep.current=null;if(!k||!k.el.isConnected)return
  const d=k.el.getBoundingClientRect().top-k.top;if(Math.abs(d)<1)return
  const box=scrollBoxOf(k.el);if(box)box.scrollTop+=d;else window.scrollBy(0,d)},[win.from])
 const to=Math.min(win.to,total),from=Math.max(0,Math.min(win.from,to-1))
 return{from,to,
  before:from>0?<button ref={top} type="button" className="show-earlier" onClick={earlier}>{'↑ '+label}</button>:null,
  after:to<total?<div ref={end} className="show-more-sentinel" aria-hidden="true"/>:null}
}
