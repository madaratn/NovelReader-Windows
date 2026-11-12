import React,{useEffect,useRef,useState}from'react'
import{ReportButton}from'../features/report'
import{t}from'../i18n'
import{hueOf,initials}from'../lib/util'

// ---- Readable error messages -------------------------------------------
// Engine errors can carry hundreds of lines of Java stack trace. Show one
// readable sentence; keep the raw text in a collapsible panel for debugging.
export function splitError(raw:string){let t=String(raw||'').replace(/Error invoking remote method '[^']+':\s*(Error:\s*)?/g,'').trim();const cut=t.search(/\s(Engine:|Caused by|\d{4}-\d\d-\d\dT\d\d:\d\d|at [a-z][\w$]*\.[\w$.]+\()|\s—\s|\s\|\s|\n/);let summary=(cut>0?t.slice(0,cut):t).trim();if(summary.length>240)summary=summary.slice(0,237)+'…';return{summary,details:summary===t?'':t}}
export function NoticeText({text}:{text:string}){const{summary,details}=splitError(text);const[copied,setCopied]=useState(false);return <div className="notice-text"><span>{summary}</span>{details&&<details className="notice-details"><summary>{t('Technical details')}</summary><pre>{details.replace(/\s\|\s/g,'\n')}</pre><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(details);setCopied(true);setTimeout(()=>setCopied(false),1500)}catch{}}}>{copied?t('Copied'):t('Copy details')}</button></details>}</div>}
export const ICONS:Record<string,string>={
 phone:'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
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
 trash:'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
 more:'M4 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M10.8 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M17.6 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0',
 book:'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zm0 15A1.5 1.5 0 0 0 6.5 21H19',
 play:'M4 5h16v14H4zM10 9l5 3-5 3z',
 tv:'M3 7h18v12H3zM8 3l4 4 4-4',
 film:'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
 compass:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
 download:'M12 4v11M7 10l5 5 5-5M5 20h14',
 grid:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
 comics:'M4 4h16v16H4zM4 12h16M12 4v8',
 search:'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8',
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
export function Cover({src,name}:{src?:string,name:string}){const[failed,setFailed]=useState(false);if(src&&!failed)return <img className="libcover" src={src} alt="" loading="lazy" onError={()=>setFailed(true)}/>;const h=hueOf(name);return <div className="libcover placeholder" aria-hidden="true" style={{background:`linear-gradient(150deg,hsl(${h} 45% 32%),hsl(${(h+40)%360} 50% 18%))`}}>{initials(name)}</div>}

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
 const[open,setOpen]=React.useState(false),ref=React.useRef<HTMLDivElement>(null)
 React.useEffect(()=>{if(!open)return;const out=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false)}};document.addEventListener('mousedown',out);document.addEventListener('keydown',esc,true);return()=>{document.removeEventListener('mousedown',out);document.removeEventListener('keydown',esc,true)}},[open])
 return <div ref={ref} className={'more-menu'+(open?' open':'')+(up?' up':'')+(className?' '+className:'')}><button type="button" className="more-btn" aria-haspopup="menu" aria-expanded={open} aria-label={label||t('More actions')} title={label||t('More actions')} onClick={()=>setOpen(o=>!o)}><Icon name="more"/></button>{open&&<div className="more-pop" role="menu" onClick={e=>{if((e.target as HTMLElement).closest('button'))setOpen(false)}}>{children}</div>}</div>
}
