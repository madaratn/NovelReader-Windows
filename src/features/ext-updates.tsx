// Video source (extension) updates: compares the installed versions with the
// enabled repositories, updates one or all of them, and checks once a day.
import React,{useEffect,useState}from'react'
import{t,plural}from'../i18n'
import{cleanEngineError}from'../lib/media'
import{engineFetch}from'../lib/engine'

export type ExtUpdate={pkg:string,name:string,from:string,to:string,repoUrl:string,apk:string}
const KEY='extUpdates'
const listOf=(d:any)=>Array.isArray(d)?d:(d?.extensions||d?.items||d?.plugins||[])
const cleanName=(n:any)=>String(n||'').replace(/^Aniyomi:\s*/i,'')
// "14.12" < "14.13" < "15.1"; non-numeric parts compared as text.
export function newerVersion(a:string,b:string){const pa=String(a||'').split(/[.\-+]/),pb=String(b||'').split(/[.\-+]/);for(let i=0;i<Math.max(pa.length,pb.length);i++){const x=pa[i]??'0',y=pb[i]??'0',nx=Number(x),ny=Number(y);if(!isNaN(nx)&&!isNaN(ny)){if(nx!==ny)return nx>ny}else if(x!==y)return x>y}return false}
export const enabledRepoUrls=()=>{try{const r=JSON.parse(localStorage.getItem('animeRepos')||'null');if(Array.isArray(r))return r.filter((x:any)=>x&&x.enabled&&x.url).map((x:any)=>String(x.url))}catch{}return['https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json','https://raw.githubusercontent.com/msrofficial/anime-repo/repo/index.min.json']}
export const readExtUpdates=():ExtUpdate[]=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
const saveUpdates=(u:ExtUpdate[])=>{localStorage.setItem(KEY,JSON.stringify(u));localStorage.setItem(KEY+'At',String(Date.now()));window.dispatchEvent(new Event('nr-ext-updates'))}

export async function checkExtensionUpdates(repos=enabledRepoUrls()){
 const installed=listOf(await engineFetch('/api/v1/extensions/installed'))
 const have=new Map<string,any>(installed.filter((e:any)=>e?.pkg).map((e:any)=>[String(e.pkg),e]))
 const found=new Map<string,ExtUpdate>()
 const settled=await Promise.allSettled(repos.map(async url=>({url,list:listOf(await engineFetch('/api/v1/extensions/repo?url='+encodeURIComponent(url)))})))
 for(const r of settled){if(r.status!=='fulfilled')continue;for(const x of r.value.list){const cur=have.get(String(x.pkg||''));if(!cur||!x.apk||!x.version)continue;if(!newerVersion(x.version,cur.version||'0'))continue;const prev=found.get(cur.pkg);if(prev&&!newerVersion(x.version,prev.to))continue;found.set(cur.pkg,{pkg:cur.pkg,name:cleanName(cur.name||x.name),from:String(cur.version||''),to:String(x.version),repoUrl:r.value.url,apk:String(x.apk)})}}
 const out=[...found.values()].sort((a,b)=>a.name.localeCompare(b.name));saveUpdates(out);return out
}
// The engine keeps one copy per package: remove the old one, then install the new one.
export async function updateExtension(u:ExtUpdate){
 await engineFetch('/api/v1/extensions/uninstall','POST',{pkg:u.pkg})
 try{const r:any=await engineFetch('/api/v1/extensions/install','POST',{repoUrl:u.repoUrl,apk:u.apk});if(r&&r.ok===false)throw new Error(r.error||'install failed')}
 catch(e:any){throw new Error(t('{name} could not be updated: {error}. Reinstall it from the repositories below.',{name:u.name,error:cleanEngineError(e)}))}
 saveUpdates(readExtUpdates().filter(x=>x.pkg!==u.pkg))
}
export async function updateAllExtensions(list=readExtUpdates(),onProgress?:(done:number,total:number)=>void){let ok=0;const errors:string[]=[];let i=0;for(const u of list){onProgress?.(i++,list.length);try{await updateExtension(u);ok++}catch(e:any){errors.push(String(e?.message||e))}}onProgress?.(list.length,list.length);return{ok,errors}}
// Once a day, 60 s after start (App). Updates by itself when the setting is on.
export async function backgroundExtensionCheck(){
 if(Date.now()-(Number(localStorage.getItem(KEY+'At'))||0)<20*3600e3)return
 const st:any=await window.novelReader.miwayomiStatus().catch(()=>null);if(!st?.online)return
 const list=await checkExtensionUpdates().catch(()=>[] as ExtUpdate[])
 if(list.length&&localStorage.getItem('extAutoUpdate')==='1')await updateAllExtensions(list)
}
export function useExtUpdates(){const[u,setU]=useState(readExtUpdates);useEffect(()=>{const f=()=>setU(readExtUpdates());window.addEventListener('nr-ext-updates',f);return()=>window.removeEventListener('nr-ext-updates',f)},[]);return u}

// Panel on the Video sources page.
export function ExtensionUpdates(){
 const list=useExtUpdates(),[busy,setBusy]=useState(''),[msg,setMsg]=useState<{ok:boolean,text:string}|null>(null),[auto,setAuto]=useState(()=>localStorage.getItem('extAutoUpdate')==='1')
 const at=Number(localStorage.getItem(KEY+'At'))||0
 const check=async()=>{setBusy('check');setMsg(null);try{const r=await checkExtensionUpdates();setMsg({ok:true,text:r.length?plural(r.length,'{n} source can be updated.','{n} sources can be updated.'):t('All your sources are up to date.')})}catch(e:any){setMsg({ok:false,text:cleanEngineError(e)})}finally{setBusy('')}}
 const one=async(u:ExtUpdate)=>{setBusy(u.pkg);setMsg(null);try{await updateExtension(u);setMsg({ok:true,text:t('{name} updated to {version}.',{name:u.name,version:u.to})})}catch(e:any){setMsg({ok:false,text:String(e?.message||e)})}finally{setBusy('')}}
 const all=async()=>{setBusy('all');setMsg(null);const r=await updateAllExtensions(list,(d,n)=>setMsg({ok:true,text:t('Updating {done} / {total}…',{done:Math.min(d+1,n),total:n})}));setMsg(r.errors.length?{ok:false,text:r.errors.join(' · ')}:{ok:true,text:plural(r.ok,'{n} source updated.','{n} sources updated.')});setBusy('')}
 return <section className="panel ext-updates"><div className="engine-row"><div><h2>{t('Source updates')}</h2><p>{list.length?plural(list.length,'{n} source has a new version.','{n} sources have a new version.'):t('Sources get fixes often: update them when a site changes.')}{at?' · '+t('Checked {when}',{when:new Date(at).toLocaleString()}):''}</p></div><div className="libraryactions">{list.length>1&&<button className="primary" disabled={!!busy} onClick={all}>{busy==='all'?t('Updating…'):t('Update all')}</button>}<button disabled={!!busy} onClick={check}>{busy==='check'?t('Checking…'):t('Check for updates')}</button></div></div>
  {list.length>0&&<div className="health-list">{list.map(u=><div key={u.pkg} className="health-row update"><span className="health-dot" aria-hidden="true"/><div><b>{u.name}</b><small className="health-steps">{u.from+' → '+u.to}</small></div><span/><button disabled={!!busy} onClick={()=>one(u)}>{busy===u.pkg?t('Updating…'):t('Update')}</button></div>)}</div>}
  <label className="settings-check"><input type="checkbox" checked={auto} onChange={e=>{setAuto(e.target.checked);localStorage.setItem('extAutoUpdate',e.target.checked?'1':'0')}}/> {t('Update my sources automatically (checked once a day)')}</label>
  {msg&&<p className={'lib-update-status'+(msg.ok?'':' error')} role="status">{msg.text}</p>}
 </section>
}
// Small banner for the video libraries.
export function ExtUpdateBanner({onOpen}:{onOpen:()=>void}){const list=useExtUpdates();if(!list.length)return null;return <div className="ext-banner" role="status"><span>{plural(list.length,'{n} video source has an update.','{n} video sources have an update.')}</span><button onClick={onOpen}>{t('See the updates')}</button></div>}
