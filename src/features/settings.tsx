import{SubtitleSettings}from'./sub-finder'
import{PcShareSettings}from'./pc-link'
import{deviceNotify,askNotifications,showDeviceNotification}from'../platform/android-notify'
import{party}from'./watch-party'
import React,{useEffect,useRef,useState}from'react'
import{SyncSettings}from'./sync'
import{getThemePref,setThemePref}from'../lib/theme'
import type{ThemePref}from'../lib/theme'
import type{FolderSync}from'./sync'
import{t,plural,LANGS}from'../i18n'
import type{Lang}from'../i18n'
import{fmtDateTime,lsGet,lsSet}from'../lib/util'
import{Help,NoticeText}from'../ui/common'
import{ReportPanel}from'./report'
import{ProfilesPanel}from'./profiles'
import{AniListPanel}from'./anilist'
import{MALPanel}from'./mal'
import{TvSettings}from'./tv'

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
// Settings in five tabs (one shown at a time). The last tab opened is kept.
export const SETTINGS_TABS=[{id:'general',label:'General'},{id:'library',label:'Library & sync'},{id:'notifications',label:'Notifications'},{id:'video',label:'Video'},{id:'about',label:'About'}] as const
export type SettingsTab=typeof SETTINGS_TABS[number]['id']
export function SettingsPage({lang,onLang,onWelcome,onShortcuts,update,onImportLNReader,onShowLibrary,sync}:{lang:Lang,onLang:(l:Lang)=>void,onWelcome:()=>void,onShortcuts?:()=>void,update:UpdateStatus|null,onImportLNReader:()=>Promise<ImportResult|null>,onShowLibrary:()=>void,sync?:FolderSync}){
 const[imp,setImp]=useState<ImportResult|null>(null),[impBusy,setImpBusy]=useState(false),[usage,setUsage]=useState<{bytes:number,chapters:number,novels:number}|null>(null),[clearConfirm,setClearConfirm]=useState(false)
 useEffect(()=>{window.novelReader.offlineUsage?.().then(setUsage).catch(()=>{})},[])
 const[theme,setTheme]=useState<ThemePref>(getThemePref),version=useAppVersion(),[notify,setNotify]=useState(()=>lsGet('notifyNewChapters')!=='0'),[autoEp,setAutoEp]=useState(()=>lsGet('autoCheckEpisodes')!=='0'),[notifyEp,setNotifyEp]=useState(()=>lsGet('notifyNewEpisodes')!=='0')
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
 // Android: no files to export there yet, no Windows notifications, no LNReader import.
 const android=document.documentElement.classList.contains('android'),ios=document.documentElement.classList.contains('ios')
 const[tab,setTabState]=useState<SettingsTab>(()=>{const v=lsGet('settingsTab');return(SETTINGS_TABS.some(x=>x.id===v)?v:'general') as SettingsTab})
 const setTab=(v:SettingsTab)=>{setTabState(v);lsSet('settingsTab',v)}
 // Another part of the app can open a tab directly (e.g. "Settings › Sync with your PC").
 useEffect(()=>{const go=(e:Event)=>{const v=(e as CustomEvent).detail;if(SETTINGS_TABS.some(x=>x.id===v))setTab(v)};window.addEventListener('nr-settings-tab',go);return()=>window.removeEventListener('nr-settings-tab',go)},[])
 const on=(v:SettingsTab)=>tab===v
 return <>
  <header><div><h1>{t('Settings')}</h1></div></header>
  <div className="settings-layout">
  <nav className="settings-tabs" role="tablist" aria-label={t('Settings')}>{SETTINGS_TABS.map(x=><button key={x.id} role="tab" id={'stab-'+x.id} aria-selected={on(x.id)} aria-controls="settings-panel" className={on(x.id)?'on':''} onClick={()=>setTab(x.id)}>{t(x.label)}</button>)}</nav>
  <div className="settings-panel" id="settings-panel" role="tabpanel" aria-labelledby={'stab-'+tab}>
  {on('general')&&<>
  <section className="panel settings-block"><h2>{t('Appearance')}</h2>
   <div className="rs-seg settings-seg" role="radiogroup" aria-label={t('Appearance')}>{(['system','dark','light'] as ThemePref[]).map(v=><button key={v} role="radio" aria-checked={theme===v} className={theme===v?'on':''} onClick={()=>{setThemePref(v);setTheme(v)}}>{v==='system'?(android?t('Like the phone'):t('Like Windows')):v==='dark'?t('Dark'):t('Light')}</button>)}</div>
   <Help text={t('The reader has its own themes: open Aa while reading.')}/>
  </section>
  <section className="panel settings-block"><h2>{t('Language')}</h2>
   <div className="rs-seg settings-seg" role="radiogroup" aria-label={t('Language')}>{LANGS.map(l=><button key={l.id} role="radio" aria-checked={lang===l.id} className={lang===l.id?'on':''} onClick={()=>onLang(l.id)}>{l.label}</button>)}</div>
  </section>
  <UpdateSettings status={update} version={version}/>
  <ProfilesPanel/>
  <TvSettings/>
  </>}
  {on('library')&&<>
  {(!android||typeof (window.novelReader as any).backupExport==='function')&&<section className="panel settings-block backup-block"><h2>{t('Backup and restore')}</h2>
   <Help text={t('Your library, reading progress and preferences are stored on this PC. Export a backup file to keep them safe or to move them to another computer.')}/>
   <div className="libraryactions"><button className="primary" disabled={busy} onClick={doExport}>{t('Export a backup…')}</button><button disabled={busy} onClick={doImport}>{t('Restore from a file…')}</button></div>
   {msg&&<div className={'anime-toast '+(msg.ok?'ok':'error')} role="status"><NoticeText text={msg.text}/><button aria-label={t('Dismiss')} onClick={()=>setMsg(null)}>×</button></div>}
   {!android&&<><h3 className="settings-sub">{t('Automatic backups')}</h3>
   <Help text={t('NovelReader keeps the last 10 versions of your data automatically. A copy of the current data is also saved before any restore.')}/>
   {autos.length===0?<Help text={t('No automatic backup yet.')}/>:<div className="scanlist">{autos.map(a=><div className="scanrow settings-row" key={a.name}><span>{fmtDateTime(a.exportedAt)}</span><small>{plural(a.novels,'{n} novel','{n} novels')}</small><button className={confirm===a.name?'danger':undefined} disabled={busy} onClick={()=>doRestoreAuto(a.name)}>{confirm===a.name?t('Confirm restore'):t('Restore')}</button></div>)}</div>}
   <div className="libraryactions"><button disabled={busy} onClick={doBackupNow}>{t('Back up now')}</button><button onClick={()=>window.novelReader.backupOpenFolder().catch(e=>setMsg({ok:false,text:String(e?.message||e)}))}>{t('Open backups folder')}</button></div></>}
  </section>}
  {!android&&<section className="panel settings-block"><h2>{t('Import from LNReader (Android)')}</h2>
   <Help text={t('In the LNReader app, open More > Backup and restore > Create backup, copy the .zip file to this PC, then import it here. Your novels and where you stopped reading are added to your library.')}/>
   <div className="libraryactions"><button className="primary" disabled={impBusy} onClick={async()=>{setImpBusy(true);setMsg(null);setImp(null);try{setImp(await onImportLNReader())}catch(e:any){setMsg({ok:false,text:t(String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/,''))})}finally{setImpBusy(false)}}}>{impBusy?t('Importing…'):t('Import an LNReader backup…')}</button></div>
   {imp&&<div className="anime-toast ok" role="status"><span>{plural(imp.added,'{n} novel imported','{n} novels imported')}{imp.exists?' · '+plural(imp.exists,'{n} already in your library','{n} already in your library'):''}{imp.unknown.length?' · '+t('{n} skipped (source not available: {list})',{n:imp.unknown.length,list:imp.unknown.slice(0,4).join(', ')}):''}</span><button className="undo-btn" onClick={onShowLibrary}>{t('Open library')}</button></div>}
  </section>}
  {sync&&<SyncSettings sync={sync}/>}{!android&&<PcShareSettings/>}
  <section className="panel settings-block"><h2>{t('Offline chapters')}</h2>
   <p className="settings-help">{usage&&usage.chapters?t('{chapters} for {novels} use {size} on this PC.',{chapters:plural(usage.chapters,'{n} chapter','{n} chapters'),novels:plural(usage.novels,'{n} novel','{n} novels'),size:(usage.bytes/1048576).toFixed(1)+' MB'}):t('No chapter downloaded yet. Use Download on a novel page to read without an internet connection.')}</p>
   {usage&&usage.chapters>0&&<div className="libraryactions"><button className={clearConfirm?'danger':undefined} onClick={async()=>{if(!clearConfirm){setClearConfirm(true);setTimeout(()=>setClearConfirm(false),6000);return}await window.novelReader.offlineClear?.();setClearConfirm(false);setUsage({bytes:0,chapters:0,novels:0})}}>{clearConfirm?t('Confirm: delete all downloads'):t('Delete all downloaded chapters')}</button></div>}
  </section>
  <AniListPanel onSearch={q=>window.dispatchEvent(new CustomEvent('nr-search-anime',{detail:q}))}/>
  <MALPanel onSearch={q=>window.dispatchEvent(new CustomEvent('nr-search-anime',{detail:q}))}/>
  </>}
  {on('notifications')&&<section className="panel settings-block"><h2>{t('New chapters and episodes')}</h2>
   <h3 className="settings-sub">{t('Books')}</h3>
   <label className="settings-check"><input type="checkbox" checked={autoCheck} onChange={e=>{setAutoCheck(e.target.checked);lsSet('autoCheckUpdates',e.target.checked?'1':'0')}}/> {t('Check my library for new chapters when NovelReader starts (at most every 12 hours)')}</label>
   {(!android||deviceNotify())&&<label className="settings-check"><input type="checkbox" checked={notify} onChange={e=>{setNotify(e.target.checked);lsSet('notifyNewChapters',e.target.checked?'1':'0');if(e.target.checked)askNotifications();window.dispatchEvent(new Event('nr-watchlist'))}}/> {t('Show a Windows notification when new chapters are found')}</label>}
   <h3 className="settings-sub">{t('Anime and series')}</h3>
   <label className="settings-check"><input type="checkbox" checked={autoEp} onChange={e=>{setAutoEp(e.target.checked);lsSet('autoCheckEpisodes',e.target.checked?'1':'0');window.dispatchEvent(new Event('nr-watchlist'))}}/> {t('Check my anime and series for new episodes in the background (every 6 hours)')}</label>
   {(!android||deviceNotify())&&<label className="settings-check"><input type="checkbox" checked={notifyEp} onChange={e=>{setNotifyEp(e.target.checked);lsSet('notifyNewEpisodes',e.target.checked?'1':'0');if(e.target.checked)askNotifications();window.dispatchEvent(new Event('nr-watchlist'))}}/> {t('Show a Windows notification when new episodes are found')}</label>}
  </section>}
  {on('video')&&<SubtitleSettings/>}
  {on('about')&&<>
  <section className="panel settings-block"><h2>{t('About')}</h2><p className="settings-help">NovelReader · {android?(document.documentElement.classList.contains('ios')?'iPhone':'Android'):'Windows'} · {version?'v'+version:''}</p><div className="libraryactions"><button onClick={onWelcome}>{t('Show the welcome guide again')}</button>{onShortcuts&&!android&&<button onClick={onShortcuts}>{t('Keyboard shortcuts')+' (?)'}</button>}</div></section>
  <ReportPanel/>
  </>}
  </div></div>
 </>
}

// ---- App version, updates and notifications --------------------------------------
export function useAppVersion(){const[v,setV]=useState('');useEffect(()=>{window.novelReader.appVersion?.().then(setV).catch(()=>{})},[]);return v}
export function useUpdateStatus(){const[s,setS]=useState<UpdateStatus|null>(null);useEffect(()=>{let off:any;window.novelReader.updateStatus?.().then(setS).catch(()=>{});off=window.novelReader.onUpdateStatus?.(setS);return()=>{off&&off()}},[]);return s}
const autoIdleOn=()=>lsGet('updateAutoIdle')!=='0'
// Tells the app when something is playing (no idle install then), every minute.
export function useUpdateBusyReport(){useEffect(()=>{const send=()=>{const busy=[...document.querySelectorAll('video,audio')].some((v:any)=>!v.paused&&!v.ended);window.novelReader?.updateBusy?.({busy,auto:autoIdleOn()}).catch(()=>{})};send();const id=setInterval(send,60_000);return()=>clearInterval(id)},[])}
// Interface updates without closing (electron/ui-update.cjs): applied by reloading the
// window when nothing is going on (no video playing, no watch party, app in the
// background or untouched for 2 minutes), or at once with the button.
const playingNow=()=>[...document.querySelectorAll('video,audio')].some((v:any)=>!v.paused&&!v.ended&&!v.dataset?.wpVoice)
export function useUiUpdate(){
 const[ui,setUi]=useState<UiStatus|null>(null)
 useEffect(()=>{const nr:any=window.novelReader;nr?.uiOk?.().catch(()=>{});nr?.uiStatus?.().then(setUi).catch(()=>{});return nr?.onUiStatus?.(setUi)},[])
 useEffect(()=>{if(ui?.state!=='ready')return
  let lastInput=Date.now();const touch=()=>{lastInput=Date.now()}
  for(const e of['pointerdown','keydown','wheel'])window.addEventListener(e,touch,{passive:true})
  const iv=setInterval(()=>{const calm=!playingNow()&&party.snap.status!=='ready'&&!document.querySelector('.readertools')
   if(calm&&(document.hidden||Date.now()-lastInput>120000))window.novelReader?.uiApply?.().catch(()=>{})},15000)
  return()=>{clearInterval(iv);for(const e of['pointerdown','keydown','wheel'])window.removeEventListener(e,touch)}},[ui?.state])
 return ui
}
const onAndroid=()=>document.documentElement.classList.contains('android')
export function UpdateBanner({status}:{status:UpdateStatus|null}){
 const[dismissed,setDismissed]=useState(''),[version,setVersion]=useState('')
 // "Updated to x.y.z" once, after an update installed itself.
 const[updated,setUpdated]=useState('')
 useEffect(()=>{window.novelReader?.appVersion?.().then((v:string)=>{setVersion(v);const prev=lsGet('lastRunVersion');lsSet('lastRunVersion',v);if(prev&&v&&prev!==v)setUpdated(v)}).catch(()=>{})},[])
 useUpdateBusyReport()
 const ui=useUiUpdate()
 if(updated)return <div className="update-banner done" role="status"><span>{t('NovelReader has been updated to {v}.',{v:updated})}</span><div><button onClick={()=>setUpdated('')}>{t('OK')}</button></div></div>
 if(ui?.state==='ready'&&dismissed!=='ui'+ui.version)return <div className="update-banner" role="status"><span>{t('NovelReader {v} is ready. It applies by itself when you are not using the app, without closing it.',{v:ui.version||''})}</span><div><button className="primary" onClick={()=>window.novelReader?.uiApply?.()}>{t('Update now (1 second)')}</button><button onClick={()=>setDismissed('ui'+ui.version)}>{t('Later')}</button></div></div>
 if(status?.state==='installing')return <div className="update-banner" role="status"><span>{t('Installing the update… NovelReader will reopen by itself.')}</span></div>
 if(!status||status.state!=='ready'||dismissed===status.next)return null
 // The interface of this version is already running: the rest installs silently at closing.
 if(status.next&&(status.next===version||(ui&&(ui.state==='downloading'||ui.state==='ready')&&ui.version===status.next)))return null
 if(onAndroid())return <div className="update-banner" role="status"><span>{status.needsPermission?t('Allow NovelReader to install apps on the page that opened, then come back: the update continues.'):t('NovelReader {v} is downloaded. Tap Install and confirm: your library stays.',{v:status.next||''})}</span><div><button className="primary" onClick={()=>window.novelReader.updateInstall()}>{t('Install')}</button><button onClick={()=>setDismissed(status.next||'x')}>{t('Later')}</button></div></div>
 return <div className="update-banner" role="status"><span>{t('NovelReader {v} is ready. It installs by itself when you close the app.',{v:status.next||''})}</span><div><button className="primary" onClick={()=>window.novelReader.updateInstall()}>{t('Restart now')}</button><button onClick={()=>setDismissed(status.next||'x')}>{t('Later')}</button></div></div>
}
export function UpdateSettings({status,version}:{status:UpdateStatus|null,version:string}){
 const[busy,setBusy]=useState(false),[autoIdle,setAutoIdle]=useState(autoIdleOn)
 const[beta,setBeta]=useState(()=>lsGet('androidBetaUpdates')==='1')
 const st=status?.state,android=onAndroid()
 const text=st==='checking'?t('Checking for updates…'):st==='downloading'?t('Downloading version {v}… {p}%',{v:status?.next||'',p:status?.percent??0}):st==='ready'?(android?t('Version {v} is downloaded: tap Install, Android asks you to confirm.',{v:status?.next||''}):t('Version {v} is ready: it installs when you close NovelReader.',{v:status?.next||''})):st==='installing'?t('Installing the update…'):st==='up-to-date'?t('NovelReader is up to date.'):st==='error'?t('Could not check for updates:')+' '+(status?.error||''):st==='unsupported'?t('Automatic updates work in the installed app (not in development mode).'):t('Updates are checked automatically when NovelReader starts.')
 return <section className="panel settings-block"><h2>{t('Updates')}</h2>
  <p className="settings-help">{t('Installed version: {v}',{v:version||'—'})} · {text}</p>
  <p className="settings-help">{android?t('Updates download in the background. Android asks you to confirm the install with one tap; your library and settings stay.'):t('Updates download in the background and install silently: no installer to run, nothing to uninstall, your library and settings stay.')}</p>
  {android&&<><label className="settings-check"><input type="checkbox" checked={beta} onChange={e=>{const enabled=e.target.checked;setBeta(enabled);lsSet('androidBetaUpdates',enabled?'1':'0');(window.novelReader as any).updateSetBeta?.(enabled).catch(()=>{})}}/> {t('Receive beta versions (experimental updates)')}</label><Help text={t('Beta versions are for testing and may contain bugs. Leave this off to get stable releases only.')}/></>}
  {!android&&<label className="settings-check"><input type="checkbox" checked={autoIdle} onChange={e=>{setAutoIdle(e.target.checked);lsSet('updateAutoIdle',e.target.checked?'1':'0');window.novelReader?.updateBusy?.({busy:false,auto:e.target.checked}).catch(()=>{})}}/> {t('Also install when the PC has been idle for 15 minutes (never during a video); NovelReader reopens by itself')}</label>}
  {st==='error'&&(status as any)?.manual&&<p className="settings-help" role="alert">{t('This connection does not let the update through (it happens on some Wi-Fi networks). You can download the installer in your browser and run it: your library and settings stay.')} <a href={(status as any).manual} target="_blank" rel="noreferrer">{t('Download the latest version')}</a></p>}
  <div className="libraryactions">{st==='ready'?<button className="primary" onClick={()=>window.novelReader.updateInstall()}>{android?t('Install'):t('Restart now')}</button>:<button disabled={busy||st==='checking'||st==='downloading'} onClick={async()=>{setBusy(true);try{await window.novelReader.updateCheck?.()}finally{setBusy(false)}}}>{t('Check for updates')}</button>}</div>
 </section>
}
// Windows notification for new chapters (only when the window is not in front).
export function notifyNewEpisodes(found:number,names:string[],onClick:()=>void){
 if(lsGet('notifyNewEpisodes')==='0')return
 if(showDeviceNotification(52,plural(found,'{n} title has new episodes.','{n} titles have new episodes.'),names.filter(Boolean).slice(0,3).join(', ')+(names.length>3?'…':'')))return
 if(typeof Notification==='undefined')return
 if(document.hasFocus())return
 try{const n=new Notification(plural(found,'{n} title has new episodes.','{n} titles have new episodes.'),{body:names.filter(Boolean).slice(0,3).join(', ')+(names.length>3?'…':''),silent:false});n.onclick=()=>{window.novelReader.focusWindow?.();onClick()}}catch{}
}
export function notifyNewChapters(found:number,names:string[],onClick:()=>void){
 if(lsGet('notifyNewChapters')==='0')return
 if(showDeviceNotification(53,plural(found,'{n} novel has new chapters.','{n} novels have new chapters.'),names.slice(0,3).join(', ')+(names.length>3?'…':'')))return
 if(typeof Notification==='undefined')return
 if(document.hasFocus())return
 try{const n=new Notification(plural(found,'{n} novel has new chapters.','{n} novels have new chapters.'),{body:names.slice(0,3).join(', ')+(names.length>3?'…':''),silent:false});n.onclick=()=>{window.novelReader.focusWindow?.();onClick()}}catch{}
}
