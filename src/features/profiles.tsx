// Profiles: switcher at the bottom of the sidebar, management in Settings.
// Each profile has its own libraries, progress, settings, backups and sync folder.
import React,{useEffect,useState}from'react'
import{t}from'../i18n'

const nr=()=>window.novelReader as any
export const profilesSupported=()=>typeof nr()?.profileList==='function'
export const profileName=(p:Profile|undefined)=>p?(p.name||t('Main profile')):''
const initial=(p:Profile)=>profileName(p).trim().slice(0,1).toUpperCase()||'?'
function useProfiles(){
 const[data,setData]=useState<{list:Profile[],current:string}|null>(null)
 const reload=()=>{if(profilesSupported())nr().profileList().then(setData).catch(()=>{})}
 useEffect(()=>{reload();const f=()=>reload();window.addEventListener('nr-profiles',f);return()=>window.removeEventListener('nr-profiles',f)},[])
 return{data,reload:()=>window.dispatchEvent(new Event('nr-profiles'))}
}
export function Avatar({p,size=26}:{p:Profile,size?:number}){return <span className="pf-avatar" style={{background:p.color||'#8b7cff',width:size,height:size,fontSize:Math.round(size*.46)}} aria-hidden="true">{initial(p)}</span>}

export function ProfileSwitcher({onManage}:{collapsed?:boolean,onManage:()=>void}){
 const{data}=useProfiles(),[open,setOpen]=useState(false)
 useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{if(!(e.target as HTMLElement).closest('.pf-switch'))setOpen(false)};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close)},[open])
 if(!data||!profilesSupported())return null
 const cur=data.list.find(p=>p.id===data.current)||data.list[0]
 // With a single profile, only a discreet entry to create another one.
 return <div className="pf-switch">
  <button className="nav-item subtle pf-current" aria-expanded={open} onClick={()=>setOpen(o=>!o)} title={t('Profile: {name}',{name:profileName(cur)})}><Avatar p={cur} size={22}/><span className="label">{data.list.length>1?profileName(cur):t('Profiles')}</span></button>
  {open&&<div className="pf-menu" role="menu">
   {data.list.map(p=><button key={p.id} role="menuitemradio" aria-checked={p.id===data.current} className={'pf-item'+(p.id===data.current?' on':'')} onClick={()=>{setOpen(false);if(p.id!==data.current)nr().profileSwitch(p.id)}}><Avatar p={p}/><span>{profileName(p)}</span>{p.id===data.current&&<small>✓</small>}</button>)}
   <button role="menuitem" className="pf-item add" onClick={()=>{setOpen(false);onManage()}}>{'＋ '+t('Add or manage profiles')}</button>
  </div>}
 </div>
}

export function ProfilesPanel(){
 const{data,reload}=useProfiles(),[name,setName]=useState(''),[confirm,setConfirm]=useState(''),[msg,setMsg]=useState('')
 if(!data||!profilesSupported())return null
 const add=async()=>{const p=await nr().profileCreate(name.trim());setName('');reload();setMsg(t('Profile “{name}” created. Switch to it from the bottom of the sidebar.',{name:profileName(p)}))}
 const COLORS=['#8b7cff','#3fb37f','#e08a2e','#d9545f','#2b9bd8','#c06bd8','#c9a43a']
 return <section className="panel settings-block profiles-panel"><h2>{t('Profiles')}</h2>
  <p className="settingsnote">{t('Each person gets their own libraries, progress, bookmarks, settings, backups and sync folder. Downloads, offline chapters and sources are shared.')}</p>
  <div className="pf-list">{data.list.map(p=><div key={p.id} className={'pf-row'+(p.id===data.current?' on':'')}>
   <Avatar p={p} size={32}/>
   <input aria-label={t('Profile name')} defaultValue={p.name} placeholder={t('Main profile')} onBlur={async e=>{if(e.target.value.trim()!==p.name){await nr().profileRename(p.id,e.target.value);reload()}}}/>
   <span className="pf-colors">{COLORS.map(c=><button key={c} aria-label={t('Color')} className={'pf-color'+(p.color===c?' on':'')} style={{background:c}} onClick={async()=>{await nr().profileColor(p.id,c);reload()}}/>)}</span>
   {p.id===data.current?<small className="pf-here">{t('In use')}</small>:<button onClick={()=>nr().profileSwitch(p.id)}>{t('Switch')}</button>}
   {p.id!=='default'&&p.id!==data.current&&(confirm===p.id?<button className="danger" onClick={async()=>{await nr().profileRemove(p.id);setConfirm('');reload()}}>{t('Delete with its data')}</button>:<button className="removebtn" onClick={()=>setConfirm(p.id)}>{t('Remove')}</button>)}
  </div>)}</div>
  <form className="pf-add" onSubmit={e=>{e.preventDefault();add()}}><input value={name} onChange={e=>setName(e.target.value)} placeholder={t('New profile name')} aria-label={t('New profile name')}/><button className="primary" type="submit">{t('Add a profile')}</button></form>
  {msg&&<p className="lib-update-status" role="status">{msg}</p>}
 </section>
}
