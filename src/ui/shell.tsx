import React,{useEffect,useRef,useState}from'react'
import{t,LANGS}from'../i18n'
import type{Lang}from'../i18n'
import{useAppVersion}from'../features/settings'
import{lsGet}from'../lib/util'
import{Icon}from'../ui/common'

// ---- App shell: navigation model, sidebar, shortcuts ---------------------
export type Mode='books'|'anime'|'series'|'movies'
export type NavItem={page:string,label:string,icon:string}
export const NAV:Record<Mode,{label:string,icon:string,items:NavItem[]}>={
 books:{label:'Books',icon:'book',items:[{page:'library',label:'Library',icon:'grid'},{page:'search',label:'Global Search',icon:'search'},{page:'sources',label:'Sources',icon:'plug'}]},
 anime:{label:'Anime',icon:'play',items:[{page:'anime',label:'Anime Library',icon:'grid'},{page:'animeSearch',label:'Global Search',icon:'search'},{page:'animeSources',label:'Sources',icon:'plug'},{page:'localVideos',label:'Local Videos',icon:'folder'},{page:'archive',label:'Internet Archive',icon:'archive'}]},
 series:{label:'Series',icon:'tv',items:[{page:'series',label:'Series Library',icon:'grid'},{page:'seriesSearch',label:'Global Search',icon:'search'}]},
 movies:{label:'Movies',icon:'film',items:[{page:'movies',label:'Movie Library',icon:'grid'},{page:'movieSearch',label:'Global Search',icon:'search'}]}
}
export const MODES=Object.keys(NAV) as Mode[]
// Detail pages highlight their parent entry in the sidebar.
export const PARENT:Record<string,string>={novel:'library',reader:'library',animeDetail:'anime',seriesDetail:'series'}
export const DETAIL_TITLES:Record<string,string>={novel:'Novel',reader:'Reader',animeDetail:'Episodes',seriesDetail:'Episodes',settings:'Settings'}
export const isMode=(m:any):m is Mode=>MODES.includes(m)
export const isTopPage=(mode:Mode,page:string)=>NAV[mode].items.some(i=>i.page===page)
export function startPage(mode:Mode){const last=lsGet('lastPage:'+mode)||'';return isTopPage(mode,last)?last:NAV[mode].items[0].page}
export function pageLabel(mode:Mode,page:string){const own=NAV[mode].items.find(i=>i.page===page);if(own)return t(own.label);for(const m of MODES){const i=NAV[m].items.find(x=>x.page===page);if(i)return t(i.label)}return DETAIL_TITLES[page]?t(DETAIL_TITLES[page]):'NovelReader'}
export const SHORTCUTS:[string,string][]=[['Ctrl+1 … 4','Switch mode (Books, Anime, Series, Movies)'],['Ctrl+K  /  /','Jump to the search field of the page'],['Alt+←','Go back to the previous page (mouse back button too)'],['Ctrl+B','Collapse or expand the sidebar'],['?','Show or hide this list'],['Esc','Close this list / leave a text field']]
export function ShortcutsDialog({onClose}:{onClose:()=>void}){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{ref.current?.focus()},[]);return <div className="kbd-overlay" onClick={onClose}><div className="kbd-dialog" role="dialog" aria-modal="true" aria-labelledby="kbd-title" tabIndex={-1} ref={ref} onClick={e=>e.stopPropagation()}><h2 id="kbd-title">{t('Keyboard shortcuts')}</h2><dl>{SHORTCUTS.map(([k,v])=><React.Fragment key={k}><dt><kbd>{k}</kbd></dt><dd>{t(v)}</dd></React.Fragment>)}</dl><button className="primary" onClick={onClose}>{t('Close')}</button></div></div>}
export function Sidebar({mode,page,collapsed,onMode,onPage,onToggle,onHelp}:{mode:Mode,page:string,collapsed:boolean,onMode:(m:Mode)=>void,onPage:(p:string)=>void,onToggle:()=>void,onHelp:()=>void}){
 const current=isTopPage(mode,page)?page:PARENT[page],version=useAppVersion()
 return <aside className="sidebar" aria-label={t('Main navigation')}>
  <div className="brand-row"><div className="brand" aria-label="NovelReader"><span className="brand-full">NOVEL<span>READER</span></span><span className="brand-short">N<span>R</span></span></div><button className="iconbtn collapse-btn" onClick={onToggle} title={t(collapsed?'Expand sidebar':'Collapse sidebar')+' (Ctrl+B)'} aria-label={t(collapsed?'Expand sidebar':'Collapse sidebar')} aria-expanded={!collapsed}><Icon name={collapsed?'expand':'collapse'}/></button></div>
  <div className="mode-switch" role="tablist" aria-label={t('Mode')}>{MODES.map((m,i)=><button key={m} role="tab" aria-selected={mode===m} className={mode===m?'active':''} onClick={()=>onMode(m)} title={t(NAV[m].label)+' (Ctrl+'+(i+1)+')'}><Icon name={NAV[m].icon}/><span className="label">{t(NAV[m].label)}</span></button>)}</div>
  <nav className="nav-list">{NAV[mode].items.map(it=><button key={it.page} className={'nav-item'+(current===it.page?' active':'')} aria-current={current===it.page?'page':undefined} onClick={()=>onPage(it.page)} title={collapsed?t(it.label):undefined}><Icon name={it.icon}/><span className="label">{t(it.label)}</span></button>)}</nav>
  <div className="grow"/>
  <button className={'nav-item subtle'+(page==='settings'?' active':'')} aria-current={page==='settings'?'page':undefined} onClick={()=>onPage('settings')} title={t('Settings')}><Icon name="gear"/><span className="label">{t('Settings')}</span></button>
  <button className="nav-item subtle" onClick={onHelp} title={t('Keyboard shortcuts')+' (?)'}><Icon name="keys"/><span className="label">{t('Shortcuts')}</span></button>
  <div className="version">{version?(collapsed?'v'+version:'Windows · v'+version):''}</div>
 </aside>
}

// ---- Welcome guide (first launch) ------------------------------------------------
export function Welcome({lang,onLang,onClose,onSearch}:{lang:Lang,onLang:(l:Lang)=>void,onClose:()=>void,onSearch:()=>void}){
 const[step,setStep]=useState(0),ref=useRef<HTMLDivElement>(null)
 useEffect(()=>{ref.current?.querySelector<HTMLElement>('.welcome-body button, .welcome-actions .primary')?.focus()},[step])
 const steps=[
  <><h1>{t('Welcome to NovelReader')}</h1><p>{t('Read web novels, keep track of where you are, and watch your own videos — all in one place. First, choose your language:')}</p>
   <div className="rs-seg welcome-lang" role="radiogroup" aria-label={t('Language')}>{LANGS.map(l=><button key={l.id} role="radio" aria-checked={lang===l.id} className={lang===l.id?'on':''} onClick={()=>onLang(l.id)}>{l.label}</button>)}</div></>,
  <><h1>{t('What you can do')}</h1><ul className="welcome-list">
   <li><Icon name="book"/><div><b>{t('Read novels')}</b><span>{t('Search hundreds of sources, add novels to your library and continue exactly where you stopped.')}</span></div></li>
   <li><Icon name="folder"/><div><b>{t('Watch your videos')}</b><span>{t('Play the video files stored on this PC, grouped by folder, with resume and shortcuts.')}</span></div></li>
   <li><Icon name="archive"/><div><b>{t('Discover public-domain classics')}</b><span>{t('Stream free films and cartoons from the Internet Archive.')}</span></div></li>
   <li><Icon name="gear"/><div><b>{t('Stay safe')}</b><span>{t('Your data is backed up automatically. Settings lets you export it or move it to another PC.')}</span></div></li></ul></>,
  <><h1>{t('Add your first novel')}</h1><ol className="welcome-steps">
   <li><span>1</span>{t('Open Global Search and type a title.')}</li>
   <li><span>2</span>{t('Pick a result: NovelReader adds it to your library.')}</li>
   <li><span>3</span>{t('Click Continue in your library to start reading.')}</li></ol>
   <p className="welcome-tip">{t('Tip: press ? at any time to see the keyboard shortcuts.')}</p></>
 ]
 const last=step===steps.length-1
 return <div className="kbd-overlay welcome-overlay"><div className="welcome" role="dialog" aria-modal="true" aria-label={t('Welcome to NovelReader')} ref={ref}>
  <div className="welcome-dots" aria-hidden="true">{steps.map((_,i)=><span key={i} className={i===step?'on':''}/>)}</div>
  <div className="welcome-body">{steps[step]}</div>
  <div className="welcome-actions">
   <button className="welcome-skip" onClick={onClose}>{t('Skip')}</button>
   <div>{step>0&&<button onClick={()=>setStep(step-1)}>{t('Back')}</button>}
    {last?<><button onClick={onClose}>{t('Explore on my own')}</button><button className="primary" onClick={()=>{onClose();onSearch()}}>{t('Search a novel')}</button></>:<button className="primary" onClick={()=>setStep(step+1)}>{t('Next')}</button>}</div>
  </div>
 </div></div>
}
