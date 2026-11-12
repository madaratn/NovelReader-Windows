// Search everywhere (Ctrl+K): finds a title in every library at once (books,
// anime, series, movies) and starts a source search in any section in one step.
import React,{useEffect,useMemo,useRef,useState}from'react'
import{t}from'../i18n'
import{Cover}from'../ui/common'
import{mediaCover,mediaNorm}from'../lib/media'

export type QuickKind='books'|'anime'|'series'|'movies'
type Hit={kind:QuickKind,item:any,name:string,sub:string,score:number}
const KIND_LABEL:Record<QuickKind,string>={books:'Books',anime:'Anime',series:'Series',movies:'Movies'}
const norm=(s:string)=>mediaNorm(String(s||'')).replace(/\s+/g,' ').trim()

export function QuickSearch({libs,mode='books',onClose,onOpen,onSearchSources}:{libs:Record<QuickKind,any[]>,mode?:QuickKind,onClose:()=>void,onOpen:(kind:QuickKind,item:any)=>void,onSearchSources:(kind:QuickKind,q:string)=>void}){
 const[q,setQ]=useState(''),[sel,setSel]=useState(0),input=useRef<HTMLInputElement>(null)
 useEffect(()=>{input.current?.focus()},[])
 const hits=useMemo<Hit[]>(()=>{const n=norm(q);if(!n)return[];const words=n.split(' ');const out:Hit[]=[]
  for(const kind of Object.keys(libs) as QuickKind[])for(const item of libs[kind]||[]){const name=String(item.name||item.title||'');const h=norm(name+' '+(item.author||'')+' '+(item.sourceName||item.pluginName||''));if(!words.every(w=>h.includes(w)))continue;const nn=norm(name);out.push({kind,item,name,sub:[t(KIND_LABEL[kind]),item.sourceName||item.pluginName||item.author||''].filter(Boolean).join(' · '),score:(nn===n?0:nn.startsWith(n)?1:2)})}
  return out.sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name)).slice(0,12)},[q,libs])
 // The current section first: its source search is the usual next step.
 const actions=[mode,...(Object.keys(KIND_LABEL) as QuickKind[]).filter(k=>k!==mode)].map(kind=>({kind}))
 const total=q.trim()?hits.length+actions.length:1
 useEffect(()=>{setSel(0)},[q])
 const choose=(i:number)=>{if(!q.trim()){onSearchSources(mode,'');onClose()}else if(i<hits.length){onOpen(hits[i].kind,hits[i].item);onClose()}else{onSearchSources(actions[i-hits.length].kind,q.trim());onClose()}}
 const key=(e:React.KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose()}else if(e.key==='ArrowDown'){e.preventDefault();setSel(s=>Math.min(total-1,s+1))}else if(e.key==='ArrowUp'){e.preventDefault();setSel(s=>Math.max(0,s-1))}else if(e.key==='Enter'&&total){e.preventDefault();choose(sel)}}
 return <div className="qs-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="qs" role="dialog" aria-modal="true" aria-label={t('Search everywhere')}>
  <input ref={input} className="qs-input" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={key} placeholder={t('Search your books, anime, series and movies…')} aria-label={t('Search everywhere')}/>
  {!q.trim()&&<><p className="qs-hint">{t('Type a title. ↑ ↓ to choose, Enter to open, Esc to close.')}</p><div className="qs-results" role="listbox"><button role="option" aria-selected={sel===0} className={'qs-row action qs-all'+(sel===0?' on':'')} onClick={()=>choose(0)}><span className="qs-icon" aria-hidden="true">⌕</span><span><b>{t('Search all {section} sources',{section:t(KIND_LABEL[mode])})}</b><small>{t('Filters, languages and every source')}</small></span></button></div></>}
  {q.trim()&&<div className="qs-results" role="listbox">
   {hits.length>0&&<div className="qs-group">{t('In your libraries')}</div>}
   {hits.map((h,i)=><button key={h.kind+':'+String(h.item.id||h.item.url||h.item.path||h.name)} role="option" aria-selected={sel===i} className={'qs-row'+(sel===i?' on':'')} onMouseEnter={()=>setSel(i)} onClick={()=>choose(i)}><Cover src={mediaCover(h.item)||h.item.cover||''} name={h.name}/><span><b>{h.name}</b><small>{h.sub}</small></span><span className={'qs-kind '+h.kind}>{t(KIND_LABEL[h.kind])}</span></button>)}
   {!hits.length&&<p className="qs-hint">{t('Nothing in your libraries. Search your sources:')}</p>}
   <div className="qs-group">{t('Search the sources')}</div>
   {actions.map((a,j)=>{const i=hits.length+j;return <button key={a.kind} role="option" aria-selected={sel===i} className={'qs-row action'+(sel===i?' on':'')} onMouseEnter={()=>setSel(i)} onClick={()=>choose(i)}><span className="qs-icon" aria-hidden="true">⌕</span><span><b>{t('“{q}” in {section}',{q:q.trim(),section:t(KIND_LABEL[a.kind])})}</b></span></button>})}
  </div>}
 </div></div>
}
