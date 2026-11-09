// Sources page: turn on the "Tunisian TV (YouTube)" source with a free YouTube key.
import React,{useState}from'react'
import{t}from'../i18n'
import{TNTV_CHANNELS,TNTV_ID,setTntv,tntvEnabled,tntvKey}from'./tn-tv'
import{engineFetch}from'../lib/engine'

export function TntvSetup(){
 const[key,setKey]=useState(tntvKey()),[on,setOn]=useState(tntvEnabled()),[busy,setBusy]=useState(false),[msg,setMsg]=useState<{ok:boolean,text:string}|null>(null)
 async function activate(){
  setBusy(true);setMsg(null);setTntv(key,true)
  try{const r=await engineFetch('/api/v1/anime/'+TNTV_ID+'/popular?page=1');const n=(r.animes||[]).length;setOn(true)
   setMsg({ok:n>0,text:n>0?t('Tunisian TV is ready: series from {channels}. Search them in Global Search or Discover.',{channels:TNTV_CHANNELS.slice(0,3).join(', ')}):t('The key works but no series was found on the channels.')})}
  catch(e:any){setTntv(key,false);setOn(false);setMsg({ok:false,text:String(e?.message||e)})}
  finally{setBusy(false)}
 }
 return <div className="engine-row tntv-row"><div>
  <h2>{'🇹🇳 '+t('Tunisian TV (official YouTube channels)')}</h2>
  <p>{t('Series and telefilms published by Tunisian channels on their official YouTube channels (Télévision Tunisienne, Elhiwar Ettounsi, Attessia, Carthage+, Nessma, Tunisna). They play in YouTube\'s player.')}</p>
  <p className="settings-help">{t('Needs a free YouTube key: console.cloud.google.com → create a project → enable "YouTube Data API v3" → Credentials → Create an API key, then paste it here.')} <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">console.cloud.google.com</a></p>
  <div className="tntv-key"><input type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder={t('YouTube API key')} aria-label={t('YouTube API key')} autoComplete="off"/>
   <button className="primary" disabled={busy||!key.trim()} onClick={activate}>{busy?t('Checking…'):on?t('Update'):t('Turn on')}</button>
   {on&&<button disabled={busy} onClick={()=>{setTntv(key,false);setOn(false);setMsg(null)}}>{t('Turn off')}</button>}</div>
  {msg&&<div className={'anime-toast '+(msg.ok?'ok':'error')}><span>{msg.text}</span><button onClick={()=>setMsg(null)}>×</button></div>}
 </div></div>
}
