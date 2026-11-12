// Sources page: turn on the "Tunisian TV (YouTube)" source (nothing to set up).
import React,{useState}from'react'
import{t}from'../i18n'
import{TNTV_CHANNELS,TNTV_ID,setTntv,tntvEnabled}from'./tn-tv'
import{engineFetch}from'../lib/engine'
import{Icon}from'../ui/common'

export function TntvSetup(){
 const[on,setOn]=useState(tntvEnabled()),[busy,setBusy]=useState(false),[msg,setMsg]=useState<{ok:boolean,text:string}|null>(null)
 async function activate(){
  setBusy(true);setMsg(null);setTntv(true)
  try{const r=await engineFetch('/api/v1/anime/'+TNTV_ID+'/popular?page=1');const n=(r.animes||[]).length;setOn(true)
   setMsg({ok:n>0,text:n>0?t('Tunisian TV is ready: series from {channels}. Search them in Global Search or Discover.',{channels:TNTV_CHANNELS.slice(0,3).join(', ')}):t('No series was found on the channels.')})}
  catch(e:any){setTntv(false);setOn(false);setMsg({ok:false,text:String(e?.message||e)})}
  finally{setBusy(false)}
 }
 return <div className="engine-row tntv-row"><div>
  <h2><Icon name="tv" inline/>{t('Tunisian TV (official YouTube channels)')}</h2>
  <p>{t('Series and telefilms published by Tunisian channels on their official YouTube channels (Télévision Tunisienne, Elhiwar Ettounsi, Attessia, Carthage+, Nessma, Tunisna). They play in YouTube\'s player.')}</p>
  <div className="tntv-key">
   {on?<><span className="tntv-on">{'✓ '+t('Turned on')}</span><button disabled={busy} onClick={()=>{setTntv(false);setOn(false);setMsg(null)}}>{t('Turn off')}</button></>
    :<button className="primary" disabled={busy} onClick={activate}>{busy?t('Checking…'):t('Turn on')}</button>}</div>
  {msg&&<div className={'anime-toast '+(msg.ok?'ok':'error')}><span>{msg.text}</span><button onClick={()=>setMsg(null)}>×</button></div>}
 </div></div>
}
