import React,{useEffect,useState}from'react'
import{t}from'../i18n'
// "What's new" after an update: the notes of the version (build/release-notes.md,
// packed with the interface), shown once. A first install shows nothing.
import notes from'../../build/release-notes.md?raw'
export function parseNotes(md:string){
 const version=(/^##\s*NovelReader\s+([\d.]+)/m.exec(md)||[])[1]||''
 const items=md.split(/\r?\n/).filter(l=>/^\s*-\s+/.test(l)).map(l=>l.replace(/^\s*-\s+/,'').trim())
 return{version,items}}
// **bold** only (the notes use nothing else).
const rich=(s:string)=>s.split(/\*\*(.+?)\*\*/g).map((p,i)=>i%2?<b key={i}>{p}</b>:<React.Fragment key={i}>{p}</React.Fragment>)
export function WhatsNew({text=notes}:{text?:string}){
 const{version,items}=parseNotes(text),[open,setOpen]=useState(false)
 useEffect(()=>{if(!version||!items.length)return
  const seen=localStorage.getItem('whatsNewSeen')
  // New install (no library, nothing seen yet): nothing to announce.
  if(!seen&&!localStorage.getItem('onboarded')){localStorage.setItem('whatsNewSeen',version);return}
  if(seen!==version)setOpen(true)},[])
 if(!open)return null
 const close=()=>{localStorage.setItem('whatsNewSeen',version);setOpen(false)}
 return <div className="qs-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}} onKeyDown={e=>{if(e.key==='Escape')close()}}><div className="qs whats-new" role="dialog" aria-modal="true" aria-label={t("What's new")}>
  <h2>{t("What's new in {version}",{version})}</h2>
  <ul>{items.map((x,i)=><li key={i}>{rich(x)}</li>)}</ul>
  <div className="libraryactions"><button className="primary" autoFocus onClick={close}>{t('OK')}</button></div>
 </div></div>}
