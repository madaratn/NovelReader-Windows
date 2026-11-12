// Videos on an iPhone through the PC. Apple does not let an app run the video
// sources, so the iPhone uses the engine of NovelReader on the PC, on the home Wi-Fi.
//  - PcShareSettings (PC): turn the sharing on, shows the link to type on the iPhone.
//  - PcLinkSettings (iPhone): type the link, check it, forget it.
import React,{useEffect,useState}from'react'
import{t}from'../i18n'
import{timeAgo}from'../lib/util'
import{parsePcLink,pcEngine,onIos}from'../lib/engine'
import{NoticeText}from'../ui/common'
import{QrCode,QrScanner}from'./qr'

type Share={enabled:boolean,port:number,code:string,addresses:string[],link:string,lastSeen:number,lastFrom:string}
const clean=(e:any)=>String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/,'')

export function PcShareSettings(){
 const api=window.novelReader as any,[st,setSt]=useState<Share|null>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{if(!api?.shareStatus)return;let stop=false;const load=()=>api.shareStatus().then((s:Share)=>{if(!stop)setSt(s)}).catch(()=>{});load();const iv=setInterval(load,15000);return()=>{stop=true;clearInterval(iv)}},[])
 if(!api?.shareStatus)return null
 const run=(f:()=>Promise<Share>)=>async()=>{setBusy(true);setErr('');try{setSt(await f())}catch(e){setErr(clean(e))}finally{setBusy(false)}}
 return <section className="panel settings-block pc-share"><h2>{t('Phone link')}</h2>
  <p className="settings-help">{t('Links NovelReader on your phone or tablet to this PC, on the home Wi-Fi: your library and positions are shared directly (no cloud folder needed), and an iPhone uses this PC to find and play anime, series and movies. This PC must be on, with NovelReader open.')}</p>
  {!st?.enabled?<div className="libraryactions"><button className="primary" disabled={busy} onClick={run(api.shareEnable)}>{t('Turn on the phone link')}</button></div>:<>
   {st.link&&<div className="pc-share-qr"><QrCode text={st.link} label={t('QR code of the phone link')}/><p className="settings-help">{t('On the phone: Settings › Sync with your PC › Scan the QR code.')}</p></div>}
   <p className="settings-help sync-line"><b>{t('Or type this link on the phone:')}</b> <code className="pc-share-link">{st.link||t('No network found')}</code></p>
   <p className="settings-help">{t('On the phone: Settings › Sync with your PC. Windows may ask to allow NovelReader on the network: choose Allow (private networks).')}{st.lastSeen?' '+t('Last used by {device}, {when}.',{device:st.lastFrom||t('a phone'),when:timeAgo(st.lastSeen)}):''}</p>
   <div className="libraryactions"><button disabled={busy} onClick={run(api.shareRenew)}>{t('New code')}</button><button disabled={busy} onClick={run(api.shareDisable)}>{t('Turn off')}</button></div>
  </>}
  {err&&<div className="anime-toast error" role="alert"><NoticeText text={err}/></div>}
 </section>}

// On a phone or tablet. iPhone: videos and sync go through the PC. Android: sync only
// (it has its own video engine). [sync] is the sync controller (features/sync.tsx).
export function PcLinkSettings({sync}:{sync?:any}){
 const ios=onIos(),[base,setBase]=useState(pcEngine()),[text,setText]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState<{ok:boolean,text:string}|null>(null),[scan,setScan]=useState(false)
 const ask=async(url:string)=>{const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),8000);try{return(await fetch(url,{signal:ctl.signal})).status}catch{return 0}finally{clearTimeout(tm)}}
 const check=async(b:string)=>{const hello=await ask(b+'/nr/hello')
  if(!hello)return t('The PC could not be reached. Check that it is on, that NovelReader is open on it, and that this device is on the same Wi-Fi.')
  if(hello!==200)return t('The PC refused the code. Check the link shown on the PC.')
  if(ios&&await ask(b+'/api/v1/health')!==200)return t('The PC answers, but its video engine is not running yet. Open NovelReader on the PC and try again.')
  return''}
 const changed=()=>{window.dispatchEvent(new Event('nr-sources-changed'));window.dispatchEvent(new Event('nr-engine-changed'));sync?.syncNow?.()}
 const link=async(from?:string)=>{const b=parsePcLink(typeof from==='string'?from:text);if(!b){setMsg({ok:false,text:t('This is not the link shown on the PC. It looks like 192.168.1.5:4580/abcdefghjk.')});return}
  setBusy(true);setMsg(null);const problem=await check(b);setBusy(false)
  if(problem){setMsg({ok:false,text:problem});return}
  localStorage.setItem('pcEngine',b);setBase(b);setText('');changed();setMsg({ok:true,text:ios?t('Linked. Anime, series and movies now go through your PC, and your library is shared with it.'):t('Linked. Your library is now shared with your PC.')})}
 const test=async()=>{setBusy(true);setMsg(null);const problem=await check(base);setBusy(false);setMsg(problem?{ok:false,text:problem}:{ok:true,text:t('Your PC answers.')})}
 const forget=()=>{localStorage.removeItem('pcEngine');setBase('');setMsg(null);changed()}
 return <section className="panel settings-block pc-link"><h2>{ios?t('Videos and sync through your PC'):t('Sync with your PC')}</h2>
  <p className="settings-help">{ios?t('Books and Tunisian TV work on the iPhone alone. Anime, series and movies use NovelReader on your PC, and your library is shared with it, on the same Wi-Fi: on the PC, open Settings › Phone link, turn it on, and type the link shown there.')
   :t('Your library, reading positions, notes, videos and where you stopped watching, shared with your PC on the home Wi-Fi. On the PC, open Settings › Phone link, turn it on, and type the link shown there.')}</p>
  {base?<><p className="settings-help sync-line"><b>{t('Linked PC:')}</b> <code>{base.replace(/^http:\/\//,'').replace(/\/e\/.*$/,'')}</code></p>
   {sync&&<p className="settings-help sync-line">{sync.running?<><span className="spinner" aria-hidden="true"/>{t('Syncing…')}</>:sync.lastAt?t('Last synced {when}.',{when:timeAgo(sync.lastAt)}):t('Not synced yet.')}</p>}
   <div className="libraryactions">{sync&&<button className="primary" disabled={sync.running} onClick={sync.syncNow}>{t('Sync now')}</button>}<button disabled={busy} onClick={test}>{busy?t('Checking…'):t('Test the link')}</button><button disabled={busy} onClick={forget}>{t('Unlink')}</button></div></>
  :<><div className="libraryactions"><button className="primary" disabled={busy} onClick={()=>setScan(true)}>{t('Scan the QR code')}</button></div>{scan&&<QrScanner onClose={()=>setScan(false)} onText={x=>{setScan(false);setText(x);link(x)}}/>}
  <div className="tntv-key"><input value={text} onChange={e=>setText(e.target.value)} placeholder="192.168.1.5:4580/abcdefghjk" aria-label={t('Link shown on the PC')} autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" onKeyDown={e=>{if(e.key==='Enter')link()}}/>
   <button disabled={busy||!text.trim()} onClick={()=>link()}>{busy?t('Checking…'):t('Link')}</button></div></>}
  {msg&&<div className={'anime-toast '+(msg.ok?'ok':'error')} role={msg.ok?'status':'alert'}><span>{msg.text}</span><button onClick={()=>setMsg(null)}>×</button></div>}
  {sync?.error&&base&&<div className="anime-toast error" role="alert"><NoticeText text={t(sync.error)}/></div>}
 </section>}
