// Profiles: switcher at the bottom of the sidebar, management in Settings.
// Each profile has its own libraries, progress, settings, backups and sync folder.
import React,{useEffect,useState}from'react'
import{t}from'../i18n'
import{requestPin,knownPin,loadParental}from'./parental'
import{KIDS_GENRES,validPin}from'../lib/parental'

const nr=()=>window.novelReader as any
export const profilesSupported=()=>typeof nr()?.profileList==='function'
export const profileName=(p:Profile|undefined)=>p?(p.name||t('Main profile')):''
const initial=(p:Profile)=>profileName(p).trim().slice(0,1).toUpperCase()||'?'
function useProfiles(){
 const[data,setData]=useState<{list:Profile[],current:string}|null>(null)
 const[data2,setPinSet]=useState(false)
 const reload=()=>{if(profilesSupported())nr().profileList().then((d:any)=>{setData(d);setPinSet(!!d?.pin)}).catch(()=>{})}
 useEffect(()=>{reload();const f=()=>reload();window.addEventListener('nr-profiles',f);return()=>window.removeEventListener('nr-profiles',f)},[])
 return{data,pinSet:data2,reload:()=>window.dispatchEvent(new Event('nr-profiles'))}
}
export function Avatar({p,size=26}:{p:Profile,size?:number}){return <span className={'pf-avatar'+(p.kids?' kids':'')} style={{background:p.color||'#8b7cff',width:size,height:size,fontSize:Math.round(size*.46)}} aria-hidden="true">{initial(p)}</span>}
// Switching away from a kids profile asks for the parent code (checked again by the app's back end).
export async function switchProfile(id:string,from?:Profile){let pin='';if(from?.kids){const p=await requestPin(t('Type the parent code to leave this kids profile.'));if(p===null)return false;pin=p}return nr().profileSwitch(id,pin)}

export function ProfileSwitcher({onManage}:{collapsed?:boolean,onManage:()=>void}){
 const{data}=useProfiles(),[open,setOpen]=useState(false)
 useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{if(!(e.target as HTMLElement).closest('.pf-switch'))setOpen(false)};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close)},[open])
 if(!data||!profilesSupported())return null
 const cur=data.list.find(p=>p.id===data.current)||data.list[0]
 // With a single profile, only a discreet entry to create another one.
 return <div className="pf-switch">
  <button className="nav-item subtle pf-current" aria-expanded={open} onClick={()=>setOpen(o=>!o)} title={t('Profile: {name}',{name:profileName(cur)})}><Avatar p={cur} size={22}/><span className="label">{data.list.length>1?profileName(cur):t('Profiles')}</span></button>
  {open&&<div className="pf-menu" role="menu">
   {data.list.map(p=><button key={p.id} role="menuitemradio" aria-checked={p.id===data.current} className={'pf-item'+(p.id===data.current?' on':'')} onClick={()=>{setOpen(false);if(p.id!==data.current)switchProfile(p.id,cur)}}><Avatar p={p}/><span>{profileName(p)}{p.kids?' · '+t('Kids'):''}</span>{p.id===data.current&&<small>✓</small>}</button>)}
   <button role="menuitem" className="pf-item add" onClick={()=>{setOpen(false);onManage()}}>{'＋ '+t('Add or manage profiles')}</button>
  </div>}
 </div>
}

export function ProfilesPanel(){
 const{data,pinSet,reload}=useProfiles(),[name,setName]=useState(''),[confirm,setConfirm]=useState(''),[msg,setMsg]=useState('')
 if(!data||!profilesSupported())return null
 const cur=data.list.find(p=>p.id===data.current)
 // Every change made from a kids profile, and every kids setting, needs the parent code.
 const withPin=async(f:(pin:string)=>Promise<any>,why?:string)=>{const pin=knownPin()||(pinSet?await requestPin(why):'');if(pin===null)return;try{await f(pin||'');setMsg('')}catch(e:any){setMsg(t(String(e?.message||e)))}reload();loadParental()}
 const add=async()=>{const pin=cur?.kids?await requestPin():'';if(pin===null)return;const p=await nr().profileCreate(name.trim(),pin||undefined);setName('');reload();setMsg(document.documentElement.classList.contains('android')?t('Profile “{name}” created. Tap Switch to use it.',{name:profileName(p)}):t('Profile “{name}” created. Switch to it from the bottom of the sidebar.',{name:profileName(p)}))}
 const COLORS=['#8b7cff','#3fb37f','#e08a2e','#d9545f','#2b9bd8','#c06bd8','#c9a43a']
 return <section className="panel settings-block profiles-panel"><h2>{t('Profiles')}</h2>
  <p className="settingsnote">{t('Each person gets their own libraries, progress, bookmarks, settings, backups and sync folder. Downloads, offline chapters and sources are shared.')}</p>
  <div className="pf-list">{data.list.map(p=><div key={p.id} className={'pf-row'+(p.id===data.current?' on':'')}>
   <Avatar p={p} size={32}/>
   <input aria-label={t('Profile name')} defaultValue={p.name} placeholder={t('Main profile')} onBlur={async e=>{const v=e.target.value;if(v.trim()!==p.name)await withPin(pin=>nr().profileRename(p.id,v,pin||undefined))}}/>
   <span className="pf-colors">{COLORS.map(c=><button key={c} aria-label={t('Color')} className={'pf-color'+(p.color===c?' on':'')} style={{background:c}} onClick={async()=>{await nr().profileColor(p.id,c);reload()}}/>)}</span>
   {p.id===data.current?<small className="pf-here">{t('In use')}</small>:<button onClick={()=>switchProfile(p.id,cur)}>{t('Switch')}</button>}
   {p.id!=='default'&&p.id!==data.current&&(confirm===p.id?<button className="danger" onClick={async()=>{await withPin(pin=>nr().profileRemove(p.id,pin||undefined));setConfirm('')}}>{t('Delete with its data')}</button>:<button className="removebtn" onClick={()=>setConfirm(p.id)}>{t('Remove')}</button>)}
   {pinSet&&p.id!=='default'&&<div className="pf-kids"><label className="settings-check"><input type="checkbox" checked={!!p.kids} onChange={e=>{const on=e.target.checked;withPin(pin=>nr().profileParental({pin,id:p.id,kids:on}))}}/> {t('Kids profile')}</label>
    {p.kids&&<div className="pf-genres" role="group" aria-label={t('Genres allowed')}><small>{t('Genres allowed (none chosen: everything except titles for adults)')}</small>{KIDS_GENRES.map(g=>{const on=(p.genres||[]).includes(g);return <button key={g} className={'chip'+(on?' on':'')} aria-pressed={on} onClick={()=>withPin(pin=>nr().profileParental({pin,id:p.id,genres:on?(p.genres||[]).filter(x=>x!==g):[...(p.genres||[]),g]}))}>{t(g)}</button>})}</div>}
   </div>}
  </div>)}</div>
  <ParentCode pinSet={pinSet} onDone={()=>{reload();loadParental()}}/>
  <form className="pf-add" onSubmit={e=>{e.preventDefault();add()}}><input value={name} onChange={e=>setName(e.target.value)} placeholder={t('New profile name')} aria-label={t('New profile name')}/><button className="primary" type="submit">{t('Add a profile')}</button></form>
  {msg&&<p className="lib-update-status" role="status">{msg}</p>}
 </section>
}

// Parent code: set it, change it, or remove it (which turns kids profiles back into ordinary ones).
function ParentCode({pinSet,onDone}:{pinSet:boolean,onDone:()=>void}){
 const[next,setNext]=useState(''),[again,setAgain]=useState(''),[msg,setMsg]=useState('')
 const save=async(newPin:string)=>{setMsg('');if(newPin&&!validPin(newPin))return setMsg(t('The code is 4 to 8 digits'));if(newPin&&newPin!==again)return setMsg(t('The two codes are not the same.'));const pin=pinSet?(knownPin()||await requestPin()):'';if(pin===null)return
  try{await nr().profileParental({pin,newPin});setNext('');setAgain('');setMsg(newPin?t('Parent code saved.'):t('Parent code removed.'));onDone()}catch(e:any){setMsg(t(String(e?.message||e)))}}
 return <div className="pf-parent"><h3>🔒 {t('Parent code')}</h3>
  <p className="settingsnote">{pinSet?t('A kids profile only opens titles for children, and asks for this code to open Settings and the sources, or to leave it.'):t('Set a code (4 to 8 digits) to make a profile a kids profile.')}</p>
  <form className="pf-add" onSubmit={e=>{e.preventDefault();save(next)}}><input type="password" inputMode="numeric" maxLength={8} autoComplete="new-password" value={next} onChange={e=>setNext(e.target.value.replace(/\D/g,''))} placeholder={pinSet?t('New code'):t('Code')} aria-label={pinSet?t('New code'):t('Code')}/><input type="password" inputMode="numeric" maxLength={8} autoComplete="new-password" value={again} onChange={e=>setAgain(e.target.value.replace(/\D/g,''))} placeholder={t('Same code again')} aria-label={t('Same code again')}/><button className="primary" type="submit">{pinSet?t('Change the code'):t('Set the code')}</button>{pinSet&&<button type="button" onClick={()=>save('')}>{t('Remove the code')}</button>}</form>
  {msg&&<p className="lib-update-status" role="status">{msg}</p>}
 </div>
}
