// AniList: progress of the anime you watch is sent to your AniList list, and your
// AniList list can be brought in (each title is searched in your sources).
import React,{useEffect,useState}from'react'
import{t}from'../i18n'
import{lsGet,lsSet}from'../lib/util'
import{mediaNorm}from'../lib/media'
import{Cover}from'../ui/common'

const nr=()=>window.novelReader as any
export const anilistSupported=()=>typeof nr()?.anilistStatus==='function'
const norm=(s:any)=>mediaNorm(String(s||''))
const titles=(m:any)=>[m?.title?.romaji,m?.title?.english,m?.title?.native].filter(Boolean)
const syncOn=()=>lsGet('anilistSync')!=='0'
const note=(text:string,ok:boolean)=>{lsSet('anilistLast',JSON.stringify({text,ok,at:Date.now()}));window.dispatchEvent(new Event('nr-anilist'))}

// Best AniList match for a library title (exact title first, else the first result).
export async function matchAniList(name:string){
 const d=await nr().anilistCall('search',{q:String(name).replace(/\((?:dub|sub|vf|vostfr)\)/ig,'').trim(),type:'ANIME'})
 const list=d?.Page?.media||[];const n=norm(name)
 return list.find((m:any)=>titles(m).some(x=>norm(x)===n))||list[0]||null
}
// Called when an anime episode is finished (App, 'nr-watched').
export async function anilistOnWatched(key:string,library:any[],save:(items:any[])=>void){
 if(!anilistSupported()||!syncOn()||!key.startsWith('anime:'))return
 const st:AniListStatus=await nr().anilistStatus();if(!st.connected)return
 const item=library.find(a=>key.startsWith('anime:'+String(a.id||a.url||a.name)+':'));if(!item)return
 let info:any=null;try{info=JSON.parse(lsGet('lastEpInfo:'+String(item.id||item.url||item.name))||'null')}catch{}
 const n=Number(info?.n)||0;if(!n||!key.endsWith(':'+info.url))return
 try{
  let id=Number(item.anilistId)||0,name=item.anilistTitle||''
  if(!id){const m=await matchAniList(item.name||item.title||'');if(!m){note(t('AniList: no match for {title}',{title:item.name||''}),false);return}id=m.id;name=m.title?.english||m.title?.romaji||'';save(library.map(a=>a===item?{...a,anilistId:id,anilistTitle:name}:a))}
  const e=(await nr().anilistCall('entry',{id}))?.Media
  const cur=Number(e?.mediaListEntry?.progress)||0;if(n<=cur&&e?.mediaListEntry?.status!=='PLANNING')return
  const total=Number(e?.episodes)||0
  await nr().anilistCall('save',{mediaId:id,progress:n,status:total&&n>=total?'COMPLETED':'CURRENT'})
  note(t('AniList: {title} → episode {n}',{title:name||item.name,n}),true)
 }catch(err:any){note(String(err?.message||err).replace(/^Error invoking remote method '[^']+': (Error: )?/,''),false)}
}

export function AniListPanel({onSearch}:{onSearch:(title:string)=>void}){
 const[st,setSt]=useState<AniListStatus|null>(null),[clientId,setClientId]=useState(''),[token,setToken]=useState(''),[busy,setBusy]=useState(''),[err,setErr]=useState(''),[list,setList]=useState<any[]|null>(null),[sync,setSync]=useState(syncOn),[last,setLast]=useState<any>(()=>{try{return JSON.parse(lsGet('anilistLast')||'null')}catch{return null}})
 useEffect(()=>{if(anilistSupported())nr().anilistStatus().then((s:AniListStatus)=>{setSt(s);setClientId(s.clientId)}).catch(()=>{});const f=()=>{try{setLast(JSON.parse(lsGet('anilistLast')||'null'))}catch{}};window.addEventListener('nr-anilist',f);return()=>window.removeEventListener('nr-anilist',f)},[])
 if(!anilistSupported()||!st)return null
 const run=async(what:string,fn:()=>Promise<any>)=>{setBusy(what);setErr('');try{await fn()}catch(e:any){setErr(String(e?.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,''))}finally{setBusy('')}}
 const loadList=()=>run('list',async()=>{const d=await nr().anilistCall('list',{type:'ANIME'});const entries=(d?.MediaListCollection?.lists||[]).flatMap((l:any)=>l.entries||[]);setList(entries)})
 return <section className="panel settings-block anilist-panel"><h2>AniList</h2>
  {!st.connected?<>
   <p className="settingsnote">{t('Send the episodes you watch to your AniList list, and bring your AniList list here.')}</p>
   <ol className="anilist-steps">
    <li>{t('On anilist.co: Settings › Developer › Create new client.')}</li>
    <li>{t('Name: NovelReader. Redirect URL:')} <code>https://anilist.co/api/v2/oauth/pin</code></li>
    <li>{t('Copy the client ID shown, paste it below, then sign in.')}</li>
   </ol>
   <div className="pf-add"><input value={clientId} onChange={e=>setClientId(e.target.value.trim())} placeholder={t('Client ID (a number)')} aria-label={t('Client ID')}/><button className="primary" disabled={!!busy||!/^\d+$/.test(clientId)} onClick={()=>run('login',async()=>setSt(await nr().anilistLogin(clientId)))}>{busy==='login'?t('Waiting for AniList…'):t('Sign in with AniList')}</button></div>
   <details className="anilist-manual"><summary>{t('Or paste a token')}</summary><div className="pf-add"><input value={token} onChange={e=>setToken(e.target.value)} placeholder={t('Access token')} aria-label={t('Access token')}/><button disabled={!!busy||token.trim().length<20} onClick={()=>run('token',async()=>{setSt(await nr().anilistToken(token));setToken('')})}>{t('Use this token')}</button></div></details>
  </>:<>
   <div className="anilist-user">{st.user?.avatar&&<img src={st.user.avatar} alt="" width={36} height={36}/>}<div><b>{st.user?.name}</b><small>{t('Connected to AniList')}</small></div><button onClick={()=>run('logout',async()=>{setSt(await nr().anilistLogout());setList(null)})}>{t('Sign out')}</button></div>
   <label className="settings-check"><input type="checkbox" checked={sync} onChange={e=>{setSync(e.target.checked);lsSet('anilistSync',e.target.checked?'1':'0')}}/> {t('Update my AniList progress when I finish an anime episode')}</label>
   {last&&<p className={'lib-update-status'+(last.ok?'':' error')}>{last.text}</p>}
   <div className="libraryactions"><button disabled={!!busy} onClick={loadList}>{busy==='list'?t('Loading…'):list?t('Reload my AniList list'):t('Show my AniList list')}</button></div>
   {list&&(list.length?<div className="anilist-list">{list.map((e:any)=><div key={e.media.id} className="anilist-row"><Cover src={e.media.coverImage?.medium||''} name={e.media.title?.romaji||'?'}/><div><b>{e.media.title?.english||e.media.title?.romaji}</b><small>{(e.status==='PLANNING'?t('Planned'):t('Episode {n}',{n:e.progress||0}))+(e.media.episodes?' / '+e.media.episodes:'')}</small></div><button onClick={()=>onSearch(e.media.title?.romaji||e.media.title?.english)}>{t('Find in my sources')}</button></div>)}</div>:<p className="settingsnote">{t('Your AniList list is empty.')}</p>)}
  </>}
  {err&&<p className="lib-update-status error" role="status">{err}</p>}
 </section>
}
