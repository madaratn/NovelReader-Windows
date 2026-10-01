import React,{useEffect,useRef,useState}from'react'
import{t}from'../i18n'
import{hueOf,initials}from'../lib/util'

// ---- Readable error messages -------------------------------------------
// Engine errors can carry hundreds of lines of Java stack trace. Show one
// readable sentence; keep the raw text in a collapsible panel for debugging.
export function splitError(raw:string){let t=String(raw||'').replace(/Error invoking remote method '[^']+':\s*(Error:\s*)?/g,'').trim();const cut=t.search(/\s(Engine:|Caused by|\d{4}-\d\d-\d\dT\d\d:\d\d|at [a-z][\w$]*\.[\w$.]+\()|\s—\s|\s\|\s|\n/);let summary=(cut>0?t.slice(0,cut):t).trim();if(summary.length>240)summary=summary.slice(0,237)+'…';return{summary,details:summary===t?'':t}}
export function NoticeText({text}:{text:string}){const{summary,details}=splitError(text);const[copied,setCopied]=useState(false);return <div className="notice-text"><span>{summary}</span>{details&&<details className="notice-details"><summary>{t('Technical details')}</summary><pre>{details.replace(/\s\|\s/g,'\n')}</pre><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(details);setCopied(true);setTimeout(()=>setCopied(false),1500)}catch{}}}>{copied?t('Copied'):t('Copy details')}</button></details>}</div>}
export const ICONS:Record<string,string>={
 book:'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zm0 15A1.5 1.5 0 0 0 6.5 21H19',
 play:'M4 5h16v14H4zM10 9l5 3-5 3z',
 tv:'M3 7h18v12H3zM8 3l4 4 4-4',
 film:'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
 grid:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
 comics:'M4 4h16v16H4zM4 12h16M12 4v8',
 search:'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8',
 plug:'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4',
 folder:'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
 archive:'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
 collapse:'M15 6l-6 6 6 6',
 expand:'M9 6l6 6-6 6',
 keys:'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
 gear:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'
}
export function Icon({name}:{name:string}){return <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]||''}/></svg>}
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
   <div className="libraryactions">{this.props.onHome&&<button className="primary" onClick={()=>{this.setState({error:null});this.props.onHome!()}}>{t('Back to library')}</button>}<button className={this.props.onHome?undefined:'primary'} onClick={()=>location.reload()}>{t('Reload')}</button></div>
   <div className="crash-detail"><NoticeText text={t('Error:')+' '+String(e?.message||e)+' | '+detail}/></div>
  </section></div>
 }
}
