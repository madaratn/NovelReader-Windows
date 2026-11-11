// Videos on an iPhone through the PC. Apple does not let an app run the video
// sources, so the iPhone uses the engine of NovelReader on the PC, on the home Wi-Fi.
//  - PcShareSettings (PC): turn the sharing on, shows the link to type on the iPhone.
//  - PcLinkSettings (iPhone): type the link, check it, forget it.
import React,{useEffect,useState}from'react'
import{t}from'../i18n'
import{timeAgo}from'../lib/util'
import{parsePcLink,pcEngine}from'../lib/engine'
import{NoticeText}from'../ui/common'

type Share={enabled:boolean,port:number,code:string,addresses:string[],link:string,lastSeen:number,lastFrom:string}
const clean=(e:any)=>String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/,'')

export function PcShareSettings(){
 const api=window.novelReader as any,[st,setSt]=useState<Share|null>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{if(!api?.shareStatus)return;let stop=false;const load=()=>api.shareStatus().then((s:Share)=>{if(!stop)setSt(s)}).catch(()=>{});load();const iv=setInterval(load,15000);return()=>{stop=true;clearInterval(iv)}},[])
 if(!api?.shareStatus)return null
 const run=(f:()=>Promise<Share>)=>async()=>{setBusy(true);setErr('');try{setSt(await f())}catch(e){setErr(clean(e))}finally{setBusy(false)}}
 return <section className="panel settings-block pc-share"><h2>{t('Videos on your iPhone')}</h2>
  <p className="settings-help">{t('An iPhone cannot run the video sources itself. With this turned on, NovelReader on your iPhone uses this PC to find and play anime, series and movies, when both are on the same Wi-Fi and this PC is on.')}</p>
  {!st?.enabled?<div className="libraryactions"><button className="primary" disabled={busy} onClick={run(api.shareEnable)}>{t('Turn on for my iPhone')}</button></div>:<>
   <p className="settings-help sync-line"><b>{t('Link to type on the iPhone:')}</b> <code className="pc-share-link">{st.link||t('No network found')}</code></p>
   <p className="settings-help">{t('On the iPhone: Settings › Videos through your PC. Windows may ask to allow NovelReader on the network: choose Allow (private networks).')}{st.lastSeen?' '+t('Last used by {device}, {when}.',{device:st.lastFrom||'iPhone',when:timeAgo(st.lastSeen)}):''}</p>
   <div className="libraryactions"><button disabled={busy} onClick={run(api.shareRenew)}>{t('New code')}</button><button disabled={busy} onClick={run(api.shareDisable)}>{t('Turn off')}</button></div>
  </>}
  {err&&<div className="anime-toast error" role="alert"><NoticeText text={err}/></div>}
 </section>}

export function PcLinkSettings(){
 const[base,setBase]=useState(pcEngine()),[text,setText]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState<{ok:boolean,text:string}|null>(null)
 const check=async(b:string)=>{const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),8000);try{const r=await fetch(b+'/api/v1/health',{signal:ctl.signal});return r.ok?'':r.status===502?t('The PC answers, but its video engine is not running yet. Open NovelReader on the PC and try again.'):t('The PC refused the code. Check the link shown on the PC.')}catch{return t('The PC could not be reached. Check that it is on, that NovelReader is open on it, and that the iPhone is on the same Wi-Fi.')}finally{clearTimeout(tm)}}
 const changed=()=>{window.dispatchEvent(new Event('nr-sources-changed'));window.dispatchEvent(new Event('nr-engine-changed'))}
 const link=async()=>{const b=parsePcLink(text);if(!b){setMsg({ok:false,text:t('This is not the link shown on the PC. It looks like 192.168.1.5:4580/abcdefghjk.')});return}
  setBusy(true);setMsg(null);const problem=await check(b);setBusy(false)
  if(problem){setMsg({ok:false,text:problem});return}
  localStorage.setItem('pcEngine',b);setBase(b);setText('');changed();setMsg({ok:true,text:t('Linked. Anime, series and movies now go through your PC.')})}
 const test=async()=>{setBusy(true);setMsg(null);const problem=await check(base);setBusy(false);setMsg(problem?{ok:false,text:problem}:{ok:true,text:t('Your PC answers.')})}
 const forget=()=>{localStorage.removeItem('pcEngine');setBase('');setMsg(null);changed()}
 return <section className="panel settings-block pc-link"><h2>{t('Videos through your PC')}</h2>
  <p className="settings-help">{t('Books and Tunisian TV work on the iPhone alone. Anime, series and movies use NovelReader on your PC, on the same Wi-Fi: on the PC, open Settings › Videos on your iPhone, turn it on, and type the link shown there.')}</p>
  {base?<><p className="settings-help sync-line"><b>{t('Linked PC:')}</b> <code>{base.replace(/^http:\/\//,'').replace(/\/e\/.*$/,'')}</code></p>
   <div className="libraryactions"><button className="primary" disabled={busy} onClick={test}>{busy?t('Checking…'):t('Test the link')}</button><button disabled={busy} onClick={forget}>{t('Unlink')}</button></div></>
  :<div className="tntv-key"><input value={text} onChange={e=>setText(e.target.value)} placeholder="192.168.1.5:4580/abcdefghjk" aria-label={t('Link shown on the PC')} autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" onKeyDown={e=>{if(e.key==='Enter')link()}}/>
   <button className="primary" disabled={busy||!text.trim()} onClick={link}>{busy?t('Checking…'):t('Link')}</button></div>}
  {msg&&<div className={'anime-toast '+(msg.ok?'ok':'error')} role={msg.ok?'status':'alert'}><span>{msg.text}</span><button onClick={()=>setMsg(null)}>×</button></div>}
 </section>}
