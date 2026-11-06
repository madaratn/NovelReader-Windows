// "Report a problem": one text with versions, engine state, installed sources and
// the recent logs of the app, the window and the video engine — ready to copy or
// save, so nobody has to dig into the developer console again.
import React,{useState}from'react'
import{t}from'../i18n'

const MAX=200
const uiLines:string[]=[]
let installed=false
const push=(level:string,parts:any[])=>{try{const text=parts.map(a=>a instanceof Error?(a.stack||a.message):typeof a==='string'?a:(()=>{try{return JSON.stringify(a)}catch{return String(a)}})()).join(' ');uiLines.push(new Date().toISOString().slice(11,19)+' '+level+' '+text.slice(0,1500));if(uiLines.length>MAX)uiLines.splice(0,uiLines.length-MAX)}catch{}}
// Called once at start-up (main.tsx): keeps window errors and console warnings.
export function captureUiLogs(){
 if(installed)return;installed=true
 for(const level of ['warn','error'] as const){const orig=console[level].bind(console);console[level]=(...a:any[])=>{push(level.toUpperCase(),a);orig(...a)}}
 window.addEventListener('error',e=>push('ERROR',[e.message+(e.filename?' @'+e.filename.split('/').pop()+':'+e.lineno:'')]))
 window.addEventListener('unhandledrejection',e=>push('ERROR',['Unhandled: ',(e as any).reason]))
}
export const noteForReport=(line:string)=>push('NOTE',[line])

const LIB_KEYS=['library','animeLibrary','seriesLibrary','movieLibrary']
export async function buildReport(context=''){
 const nr:any=window.novelReader
 const main:any=await nr.reportCollect?.().catch((e:any)=>({error:String(e?.message||e)}))||{}
 let sources:string[]=[]
 try{const inst:any=await nr.miwayomiFetch('/api/v1/extensions/installed');const list=Array.isArray(inst)?inst:(inst?.extensions||inst?.items||[]);sources=list.map((e:any)=>String(e.name||e.pkg).replace(/^Aniyomi:\s*/i,'')+(e.versionName?' '+e.versionName:''))}catch(e:any){sources=['(engine unavailable: '+String(e?.message||e).slice(0,120)+')']}
 const counts=LIB_KEYS.map(k=>{try{return k+'='+(JSON.parse(localStorage.getItem(k)||'[]')||[]).length}catch{return k+'=?'}}).join(', ')
 const health=(()=>{try{const h=JSON.parse(localStorage.getItem('videoSourceHealth')||'{}');return Object.entries(h).map(([k,v]:any)=>k+': '+v.state+(v.detail?' ('+v.detail+')':'')).slice(0,40)}catch{return[]}})()
 const out=[
  '=== NovelReader problem report ===',
  'Date: '+new Date().toISOString(),
  context?'What happened: '+context:'',
  'App: '+(main.app||'?')+' · Electron '+(main.electron||'?')+' · '+(main.os||navigator.userAgent),
  'Memory: '+(main.memoryMB||'?')+' MB ('+(main.freeMB||'?')+' MB free) · up '+(main.uptimeMin??'?')+' min · locale '+(main.locale||navigator.language),
  'Video engine: '+(main.engine?.running?'running':'stopped')+(main.engine?.tag?' · '+main.engine.tag:'')+(main.engine?.downloadedAt?' · '+main.engine.downloadedAt:''),
  'Page: '+(localStorage.getItem('mode')||'?')+' / '+(location.hash||'-')+' · libraries: '+counts,
  '','--- Installed video sources ('+sources.length+') ---',...sources,
  ...(health.length?['','--- Last source check ---',...health]:[]),
  '','--- Window (last '+uiLines.length+') ---',...uiLines,
  '','--- App (main process) ---',...(main.mainLogs||[]),
  '','--- Video engine ---',...(main.engineLogs||[])
 ].filter((x,i,a)=>x!==''||a[i-1]!=='').join('\n')
 return nr.reportRedact?await nr.reportRedact(out):out
}

// Small button for error messages: copies the report with the message as context.
export function ReportButton({context}:{context?:string}){
 const[state,setState]=useState<'idle'|'busy'|'done'|'fail'>('idle')
 if(!(window.novelReader as any)?.reportCollect)return null
 const go=async()=>{setState('busy');try{const text=await buildReport(context||'');await (window.novelReader as any).reportCopy(text);setState('done');setTimeout(()=>setState('idle'),4000)}catch{setState('fail')}}
 return <button className="reportbtn" disabled={state==='busy'} onClick={go} title={t('Copies a problem report (versions and recent logs) to paste in a message.')}>{state==='done'?'✓ '+t('Report copied'):state==='busy'?t('Preparing…'):state==='fail'?t('Could not build the report'):t('Copy a problem report')}</button>
}

// Settings block.
export function ReportPanel(){
 const[text,setText]=useState(''),[what,setWhat]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState('')
 const nr:any=window.novelReader
 if(!nr?.reportCollect)return null
 const make=async()=>{setBusy(true);setMsg('');try{const r=await buildReport(what.trim());setText(r);return r}finally{setBusy(false)}}
 const copy=async()=>{const r=text&&!what?text:await make();await nr.reportCopy(r);setMsg(t('Report copied. Paste it in your message.'))}
 const save=async()=>{const r=text?text:await make();const file=await nr.reportSave(r);if(file)setMsg(t('Report saved: {file}',{file}))}
 return <section className="panel settings-block report-panel"><h2>{t('Report a problem')}</h2>
  <p className="settingsnote">{t('Something does not work? Describe it in one line, then copy the report and paste it in your message. It contains versions and recent logs only — your home folder and passwords in links are hidden.')}</p>
  <input className="report-what" value={what} onChange={e=>{setWhat(e.target.value);setText('')}} placeholder={t('What happened? (e.g. Spider-Man does not start on Movies Mod)')}/>
  <div className="libraryactions"><button className="primary" disabled={busy} onClick={copy}>{busy?t('Preparing…'):t('Copy the report')}</button><button disabled={busy} onClick={save}>{t('Save as a file…')}</button><button disabled={busy} onClick={make}>{t('Preview')}</button></div>
  {msg&&<p className="lib-update-status" role="status">{msg}</p>}
  {text&&<textarea className="report-preview" readOnly value={text} aria-label={t('Report preview')}/>}
 </section>
}
