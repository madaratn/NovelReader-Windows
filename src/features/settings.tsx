import React,{useEffect,useRef,useState}from'react'
import{SyncSettings}from'./sync'
import{getThemePref,setThemePref}from'../lib/theme'
import type{ThemePref}from'../lib/theme'
import type{FolderSync}from'./sync'
import{t,plural,LANGS}from'../i18n'
import type{Lang}from'../i18n'
import{fmtDateTime,lsGet,lsSet}from'../lib/util'
import{NoticeText}from'../ui/common'

// ---- Backup helpers (renderer side) ------------------------------------------
// Everything the app keeps in localStorage is user data (library, progress,
// preferences) except cached plugin code, which is re-downloaded on demand.
export const BACKUP_SKIP=(k:string)=>k.startsWith('plugin:')
export function collectBackup():BackupPayload{const data:Record<string,string>={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)!;if(!BACKUP_SKIP(k)){const v=localStorage.getItem(k);if(v!=null)data[k]=v}}return{app:'NovelReader',version:1,exportedAt:Date.now(),data}}
export async function applyBackup(payload:BackupPayload){
 // Safety copy of the current data first, so a restore can always be undone.
 try{await window.novelReader.backupAuto(collectBackup(),true)}catch{}
 const keep:Record<string,string>={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)!;if(BACKUP_SKIP(k))keep[k]=localStorage.getItem(k)||''}
 localStorage.clear();for(const[k,v]of Object.entries(keep))localStorage.setItem(k,v);for(const[k,v]of Object.entries(payload.data))localStorage.setItem(k,v)
 location.reload()
}

export type ImportResult={added:number,exists:number,skipped:number,unknown:string[]}
export function SettingsPage({lang,onLang,onWelcome,update,onImportLNReader,onShowLibrary,sync}:{lang:Lang,onLang:(l:Lang)=>void,onWelcome:()=>void,update:UpdateStatus|null,onImportLNReader:()=>Promise<ImportResult|null>,onShowLibrary:()=>void,sync?:FolderSync}){
 const[imp,setImp]=useState<ImportResult|null>(null),[impBusy,setImpBusy]=useState(false),[usage,setUsage]=useState<{bytes:number,chapters:number,novels:number}|null>(null),[clearConfirm,setClearConfirm]=useState(false)
 useEffect(()=>{window.novelReader.offlineUsage?.().then(setUsage).catch(()=>{})},[])
 const[theme,setTheme]=useState<ThemePref>(getThemePref),version=useAppVersion(),[notify,setNotify]=useState(()=>lsGet('notifyNewChapters')!=='0')
 const[autos,setAutos]=useState<{name:string,novels:number,exportedAt:number}[]>([]),[msg,setMsg]=useState<{ok:boolean,text:string}|null>(null),[confirm,setConfirm]=useState<string|null>(null),[busy,setBusy]=useState(false)
 const[autoCheck,setAutoCheck]=useState(()=>lsGet('autoCheckUpdates')!=='0')
 const refresh=async()=>{try{setAutos(await window.novelReader.backupListAuto())}catch{}}
 useEffect(()=>{refresh()},[])
 useEffect(()=>{if(!confirm)return;const tm=setTimeout(()=>setConfirm(null),6000);return()=>clearTimeout(tm)},[confirm])
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMsg(null);try{await fn()}catch(e:any){setMsg({ok:false,text:t(String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/,''))})}finally{setBusy(false)}}
 const doExport=()=>run(async()=>{const r=await window.novelReader.backupExport(collectBackup());if(r.ok)setMsg({ok:true,text:t('Backup saved: {path}',{path:r.path||''})})})
 const doImport=()=>run(async()=>{const r=await window.novelReader.backupImport();if(!r.ok||!r.payload)return;if(!window.confirm(t('Replace your current library and settings with this backup ({n})?',{n:plural(r.novels||0,'{n} novel','{n} novels')})))return;await applyBackup(r.payload)})
 const doRestoreAuto=(name:string)=>{if(confirm!==name){setConfirm(name);return}run(async()=>{await applyBackup(await window.novelReader.backupReadAuto(name))})}
 const doBackupNow=()=>run(async()=>{const r=await window.novelReader.backupAuto(collectBackup(),true);setMsg({ok:true,text:r.saved?t('Automatic backup created.'):t('Nothing changed since the last backup.')});refresh()})
 return <>
  <header><div><h1>{t('Settings')}</h1><p>{t('Language, backups and updates.')}</p></div></header>
  <section className="panel settings-block"><h2>{t('Appearance')}</h2>
   <div className="rs-seg settings-seg" role="radiogroup" aria-label={t('Appearance')}>{(['system','dark','light'] as ThemePref[]).map(v=><button key={v} role="radio" aria-checked={theme===v} className={theme===v?'on':''} onClick={()=>{setThemePref(v);setTheme(v)}}>{v==='system'?t('Like Windows'):v==='dark'?t('Dark'):t('Light')}</button>)}</div>
   <p className="settings-help">{t('The reader has its own themes: open Aa while reading.')}</p>
  </section>
  <section className="panel settings-block"><h2>{t('Language')}</h2>
   <div className="rs-seg settings-seg" role="radiogroup" aria-label={t('Language')}>{LANGS.map(l=><button key={l.id} role="radio" aria-checked={lang===l.id} className={lang===l.id?'on':''} onClick={()=>onLang(l.id)}>{l.label}</button>)}</div>
  </section>
  <section className="panel settings-block"><h2>{t('Backup and restore')}</h2>
   <p className="settings-help">{t('Your library, reading progress and preferences are stored on this PC. Export a backup file to keep them safe or to move them to another computer.')}</p>
   <div className="libraryactions"><button className="primary" disabled={busy} onClick={doExport}>{t('Export a backup…')}</button><button disabled={busy} onClick={doImport}>{t('Restore from a file…')}</button></div>
   {msg&&<div className={'anime-toast '+(msg.ok?'ok':'error')} role="status"><NoticeText text={msg.text}/><button aria-label={t('Dismiss')} onClick={()=>setMsg(null)}>×</button></div>}
   <h3 className="settings-sub">{t('Automatic backups')}</h3>
   <p className="settings-help">{t('NovelReader keeps the last 10 versions of your data automatically. A copy of the current data is also saved before any restore.')}</p>
   {autos.length===0?<p className="settings-help">{t('No automatic backup yet.')}</p>:<div className="scanlist">{autos.map(a=><div className="scanrow settings-row" key={a.name}><span>{fmtDateTime(a.exportedAt)}</span><small>{plural(a.novels,'{n} novel','{n} novels')}</small><button className={confirm===a.name?'danger':undefined} disabled={busy} onClick={()=>doRestoreAuto(a.name)}>{confirm===a.name?t('Confirm restore'):t('Restore')}</button></div>)}</div>}
   <div className="libraryactions"><button disabled={busy} onClick={doBackupNow}>{t('Back up now')}</button><button onClick={()=>window.novelReader.backupOpenFolder().catch(e=>setMsg({ok:false,text:String(e?.message||e)}))}>{t('Open backups folder')}</button></div>
  </section>
  <section className="panel settings-block"><h2>{t('New chapters')}</h2>
   <label className="settings-check"><input type="checkbox" checked={autoCheck} onChange={e=>{setAutoCheck(e.target.checked);lsSet('autoCheckUpdates',e.target.checked?'1':'0')}}/> {t('Check my library for new chapters when NovelReader starts (at most every 12 hours)')}</label>
   <label className="settings-check"><input type="checkbox" checked={notify} onChange={e=>{setNotify(e.target.checked);lsSet('notifyNewChapters',e.target.checked?'1':'0')}}/> {t('Show a Windows notification when new chapters are found')}</label>
  </section>
  <section className="panel settings-block"><h2>{t('Import from LNReader (Android)')}</h2>
   <p className="settings-help">{t('In the LNReader app, open More > Backup and restore > Create backup, copy the .zip file to this PC, then import it here. Your novels and where you stopped reading are added to your library.')}</p>
   <div className="libraryactions"><button className="primary" disabled={impBusy} onClick={async()=>{setImpBusy(true);setMsg(null);setImp(null);try{setImp(await onImportLNReader())}catch(e:any){setMsg({ok:false,text:t(String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/,''))})}finally{setImpBusy(false)}}}>{impBusy?t('Importing…'):t('Import an LNReader backup…')}</button></div>
   {imp&&<div className="anime-toast ok" role="status"><span>{plural(imp.added,'{n} novel imported','{n} novels imported')}{imp.exists?' · '+plural(imp.exists,'{n} already in your library','{n} already in your library'):''}{imp.unknown.length?' · '+t('{n} skipped (source not available: {list})',{n:imp.unknown.length,list:imp.unknown.slice(0,4).join(', ')}):''}</span><button className="undo-btn" onClick={onShowLibrary}>{t('Open library')}</button></div>}
  </section>
  {sync&&<SyncSettings sync={sync}/>}
  <section className="panel settings-block"><h2>{t('Offline chapters')}</h2>
   <p className="settings-help">{usage&&usage.chapters?t('{chapters} for {novels} use {size} on this PC.',{chapters:plural(usage.chapters,'{n} chapter','{n} chapters'),novels:plural(usage.novels,'{n} novel','{n} novels'),size:(usage.bytes/1048576).toFixed(1)+' MB'}):t('No chapter downloaded yet. Use Download on a novel page to read without an internet connection.')}</p>
   {usage&&usage.chapters>0&&<div className="libraryactions"><button className={clearConfirm?'danger':undefined} onClick={async()=>{if(!clearConfirm){setClearConfirm(true);setTimeout(()=>setClearConfirm(false),6000);return}await window.novelReader.offlineClear?.();setClearConfirm(false);setUsage({bytes:0,chapters:0,novels:0})}}>{clearConfirm?t('Confirm: delete all downloads'):t('Delete all downloaded chapters')}</button></div>}
  </section>
  <UpdateSettings status={update} version={version}/>
  <section className="panel settings-block"><h2>{t('About')}</h2><p className="settings-help">NovelReader · Windows · {version?'v'+version:''}</p><button onClick={onWelcome}>{t('Show the welcome guide again')}</button></section>
 </>
}

// ---- App version, updates and notifications --------------------------------------
export function useAppVersion(){const[v,setV]=useState('');useEffect(()=>{window.novelReader.appVersion?.().then(setV).catch(()=>{})},[]);return v}
export function useUpdateStatus(){const[s,setS]=useState<UpdateStatus|null>(null);useEffect(()=>{let off:any;window.novelReader.updateStatus?.().then(setS).catch(()=>{});off=window.novelReader.onUpdateStatus?.(setS);return()=>{off&&off()}},[]);return s}
export function UpdateBanner({status}:{status:UpdateStatus|null}){
 const[dismissed,setDismissed]=useState('')
 if(!status||status.state!=='ready'||dismissed===status.next)return null
 return <div className="update-banner" role="status"><span>{t('NovelReader {v} is ready to install.',{v:status.next||''})}</span><div><button className="primary" onClick={()=>window.novelReader.updateInstall()}>{t('Restart and update')}</button><button onClick={()=>setDismissed(status.next||'x')}>{t('Later')}</button></div></div>
}
export function UpdateSettings({status,version}:{status:UpdateStatus|null,version:string}){
 const[busy,setBusy]=useState(false)
 const st=status?.state
 const text=st==='checking'?t('Checking for updates…'):st==='downloading'?t('Downloading version {v}… {p}%',{v:status?.next||'',p:status?.percent??0}):st==='ready'?t('Version {v} is ready to install.',{v:status?.next||''}):st==='up-to-date'?t('NovelReader is up to date.'):st==='error'?t('Could not check for updates:')+' '+(status?.error||''):st==='unsupported'?t('Automatic updates work in the installed app (not in development mode).'):t('Updates are checked automatically when NovelReader starts.')
 return <section className="panel settings-block"><h2>{t('Updates')}</h2>
  <p className="settings-help">{t('Installed version: {v}',{v:version||'—'})} · {text}</p>
  <div className="libraryactions">{st==='ready'?<button className="primary" onClick={()=>window.novelReader.updateInstall()}>{t('Restart and update')}</button>:<button disabled={busy||st==='checking'||st==='downloading'} onClick={async()=>{setBusy(true);try{await window.novelReader.updateCheck?.()}finally{setBusy(false)}}}>{t('Check for updates')}</button>}</div>
 </section>
}
// Windows notification for new chapters (only when the window is not in front).
export function notifyNewChapters(found:number,names:string[],onClick:()=>void){
 if(lsGet('notifyNewChapters')==='0'||typeof Notification==='undefined')return
 if(document.hasFocus())return
 try{const n=new Notification(plural(found,'{n} novel has new chapters.','{n} novels have new chapters.'),{body:names.slice(0,3).join(', ')+(names.length>3?'…':''),silent:false});n.onclick=()=>{window.novelReader.focusWindow?.();onClick()}}catch{}
}
