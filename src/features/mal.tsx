// MyAnimeList: same as AniList — progress of the anime you watch is sent to your
// MAL list, and your MAL list can be brought in (each title searched in your sources).
import React,{useEffect,useState}from'react'
import{t}from'../i18n'
import{lsGet,lsSet}from'../lib/util'
import{mediaNorm}from'../lib/media'
import{Cover}from'../ui/common'

const nr=()=>window.novelReader as any
export const malSupported=()=>typeof nr()?.malStatus==='function'
export const MAL_REDIRECT='http://localhost/novelreader-mal'
const norm=(s:any)=>mediaNorm(String(s||''))
const titles=(m:any)=>[m?.title,m?.alternative_titles?.en,m?.alternative_titles?.ja,...(m?.alternative_titles?.synonyms||[])].filter(Boolean)
const syncOn=()=>lsGet('malSync')!=='0'
const note=(text:string,ok:boolean)=>{lsSet('malLast',JSON.stringify({text,ok,at:Date.now()}));window.dispatchEvent(new Event('nr-mal'))}
const clean=(e:any)=>String(e?.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,'')

// Best MAL match for a library title (exact title first, else the first result).
export async function matchMAL(name:string){
 const d=await nr().malCall('search',{q:String(name).replace(/\((?:dub|sub|vf|vostfr)\)/ig,'').trim()})
 const list=(d?.data||[]).map((x:any)=>x.node).filter(Boolean);const n=norm(name)
 return list.find((m:any)=>titles(m).some(x=>norm(x)===n))||list[0]||null
}
// Called when an anime episode is finished (App, 'nr-watched').
export async function malOnWatched(key:string,library:any[],save:(items:any[])=>void){
 if(!malSupported()||!syncOn()||!key.startsWith('anime:'))return
 const st:MALStatus=await nr().malStatus();if(!st.connected)return
 const item=library.find(a=>key.startsWith('anime:'+String(a.id||a.url||a.name)+':'));if(!item)return
 let info:any=null;try{info=JSON.parse(lsGet('lastEpInfo:'+String(item.id||item.url||item.name))||'null')}catch{}
 const n=Number(info?.n)||0;if(!n||!key.endsWith(':'+info.url))return
 try{
  let id=Number(item.malId)||0,name=item.malTitle||''
  if(!id){const m=await matchMAL(item.name||item.title||'');if(!m){note(t('MyAnimeList: no match for {title}',{title:item.name||''}),false);return}id=m.id;name=m.alternative_titles?.en||m.title||'';save(library.map(a=>a===item?{...a,malId:id,malTitle:name}:a))}
  const e=await nr().malCall('entry',{id})
  const cur=Number(e?.my_list_status?.num_episodes_watched)||0,curStatus=e?.my_list_status?.status
  if(n<=cur&&curStatus&&curStatus!=='plan_to_watch')return
  const total=Number(e?.num_episodes)||0
  await nr().malCall('save',{id,episodes:n,status:total&&n>=total?'completed':'watching'})
  note(t('MyAnimeList: {title} → episode {n}',{title:name||item.name,n}),true)
 }catch(err:any){note(clean(err),false)}
}

const STATUS:Record<string,string>={watching:'Watching',plan_to_watch:'Planned',on_hold:'On hold'}

export function MALPanel({onSearch}:{onSearch:(title:string)=>void}){
 const[st,setSt]=useState<MALStatus|null>(null),[clientId,setClientId]=useState(''),[secret,setSecret]=useState(''),[busy,setBusy]=useState(''),[err,setErr]=useState(''),[list,setList]=useState<any[]|null>(null),[sync,setSync]=useState(syncOn),[last,setLast]=useState<any>(()=>{try{return JSON.parse(lsGet('malLast')||'null')}catch{return null}})
 useEffect(()=>{if(malSupported())nr().malStatus().then((s:MALStatus)=>{setSt(s);setClientId(s.clientId)}).catch(()=>{});const f=()=>{try{setLast(JSON.parse(lsGet('malLast')||'null'))}catch{}};window.addEventListener('nr-mal',f);return()=>window.removeEventListener('nr-mal',f)},[])
 if(!malSupported()||!st)return null
 const run=async(what:string,fn:()=>Promise<any>)=>{setBusy(what);setErr('');try{await fn()}catch(e:any){setErr(clean(e))}finally{setBusy('')}}
 const loadList=()=>run('list',async()=>setList(await nr().malCall('list',{})||[]))
 const okId=/^[0-9a-f]{16,64}$/i.test(clientId)
 return <section className="panel settings-block anilist-panel mal-panel"><h2>MyAnimeList</h2>
  {!st.connected?<>
   <p className="settingsnote">{t('Send the episodes you watch to your MyAnimeList list, and bring your MyAnimeList list here.')}</p>
   <ol className="anilist-steps">
    <li>{t('On myanimelist.net: Account Settings › API › Create ID.')}</li>
    <li>{t('App type: other. App Redirect URL:')} <code>{MAL_REDIRECT}</code></li>
    <li>{t('Copy the Client ID shown, paste it below, then sign in.')}</li>
   </ol>
   <div className="pf-add"><input value={clientId} onChange={e=>setClientId(e.target.value.trim())} placeholder={t('Client ID')} aria-label={t('MyAnimeList client ID')}/><button className="primary" disabled={!!busy||!okId} onClick={()=>run('login',async()=>setSt(await nr().malLogin(clientId,secret||undefined)))}>{busy==='login'?t('Waiting for MyAnimeList…'):t('Sign in with MyAnimeList')}</button></div>
   <details className="anilist-manual"><summary>{t('My MAL client has a secret')}</summary><div className="pf-add"><input type="password" value={secret} onChange={e=>setSecret(e.target.value.trim())} placeholder={t('Client secret (only for the "web" app type)')} aria-label={t('Client secret')}/></div></details>
  </>:<>
   <div className="anilist-user">{st.user?.avatar&&<img src={st.user.avatar} alt="" width={36} height={36}/>}<div><b>{st.user?.name}</b><small>{t('Connected to MyAnimeList')}</small></div><button onClick={()=>run('logout',async()=>{setSt(await nr().malLogout());setList(null)})}>{t('Sign out')}</button></div>
   <label className="settings-check"><input type="checkbox" checked={sync} onChange={e=>{setSync(e.target.checked);lsSet('malSync',e.target.checked?'1':'0')}}/> {t('Update my MyAnimeList progress when I finish an anime episode')}</label>
   {last&&<p className={'lib-update-status'+(last.ok?'':' error')}>{last.text}</p>}
   <div className="libraryactions"><button disabled={!!busy} onClick={loadList}>{busy==='list'?t('Loading…'):list?t('Reload my MyAnimeList list'):t('Show my MyAnimeList list')}</button></div>
   {list&&(list.length?<div className="anilist-list">{list.map((e:any)=>{const m=e.node||{},ls=e.list_status||{};return <div key={m.id} className="anilist-row"><Cover src={m.main_picture?.medium||''} name={m.title||'?'}/><div><b>{m.alternative_titles?.en||m.title}</b><small>{(ls.status==='plan_to_watch'?t('Planned'):(ls.status==='on_hold'?t(STATUS.on_hold)+' · ':'')+t('Episode {n}',{n:ls.num_episodes_watched||0}))+(m.num_episodes?' / '+m.num_episodes:'')}</small></div><button onClick={()=>onSearch(m.title||m.alternative_titles?.en)}>{t('Find in my sources')}</button></div>})}</div>:<p className="settingsnote">{t('Your MyAnimeList list is empty.')}</p>)}
  </>}
  {err&&<p className="lib-update-status error" role="status">{err}</p>}
 </section>
}
