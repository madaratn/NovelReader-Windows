// Watch party, what is seen: the button of the side menu, the panel (people, voice,
// cameras, stream, chat), the layer over the video (reactions, who did what, countdown,
// who is speaking, chat in full screen) and the camera bubbles.
// The logic (connection, clock, calls) is in watch-party.tsx.
import React,{useEffect,useRef,useState}from'react'
import{createPortal}from'react-dom'
import{t,plural,getLang}from'../i18n'
import{lsGet,lsSet}from'../lib/util'
import{Icon}from'../ui/common'
import{QrCode}from'./qr'
import{fullShell,shellOf,togglePlayerFull}from'./player-full'
import{posNow,epKey,nameHue}from'../lib/party-sync'
import{STREAM_QUALITY}from'./party-stream'
import{partySound,partySoundsOn}from'./party-sounds'
import{party,useParty,REACTIONS,partyName,roomFixed,roomCode,recentParties,forgetParty,inviteText,inviteLink,voiceVolume,type Member,type Recent}from'./watch-party'

type Snap=ReturnType<typeof useParty>
const openPanel=()=>{party.panelOpen=true;party.seen();window.dispatchEvent(new Event('nr-party-open'))}

export function WatchPartyButton(){
 const snap=useParty()
 return <button className={'nav-item subtle wp-open'+(snap.status==='ready'?' live':'')} onClick={openPanel} title={t('Watch together')}>
  <span className="wp-icon" aria-hidden="true"><Icon name="users"/></span><span className="label">{snap.status==='ready'?t('Watch party · {code}',{code:snap.code}):t('Watch together')}</span>{snap.unread>0&&<span className="wp-badge">{snap.unread}</span>}
 </button>
}

// ---- People ------------------------------------------------------------------------
const nameOf=(snap:Snap,id:string)=>snap.members.find(x=>x.id===id)?.name||t('Guest')
// Whose video can be watched as a stream: people on the party's episode whose player can be sent (the host first).
export function streamSources(snap:Snap):Member[]{
 const key=epKey(snap.state);if(!key||!snap.v2)return[]
 return snap.members.filter(m=>m.id!==snap.selfId&&(m.v||1)>=2&&snap.presence[m.id]?.can&&snap.presence[m.id]?.ep===key&&!snap.presence[m.id]?.view)
}
// What a person's player is doing, in a few words (next to their name).
function statusOf(m:Member,snap:Snap):{text:string,tone:string,title:string}{
 const p=snap.presence[m.id],st=snap.state
 if(!p)return{text:'',tone:'',title:''}
 const title=p.rtt!=null&&m.id!==snap.members[0]?.id?t('Connection: {n} ms',{n:p.rtt}):''
 if(p.view)return{text:t('Stream of {name}',{name:nameOf(snap,p.view)}),tone:'info',title}
 if(!st?.media)return{text:'',tone:'',title}
 if(!p.ep)return{text:t('No video open'),tone:'off',title}
 if(p.ep!==epKey(st))return{text:t('Another episode'),tone:'off',title}
 if(p.buf)return{text:t('Loading…'),tone:'warn',title}
 if(st.playing!==p.playing)return{text:p.playing?t('Playing'):t('Paused'),tone:'warn',title}
 const hostNow=party.hostNow(),mine=p.pos+(p.playing&&hostNow!=null?Math.max(0,hostNow-p.at)/1000*(st.rate||1):0)
 const gap=mine-posNow(st,{hostNow,recvAt:snap.stateAt,now:Date.now()}),n=(Math.round(Math.abs(gap)*10)/10).toLocaleString()
 if(Math.abs(gap)<0.6)return{text:t('In sync'),tone:'ok',title}
 return{text:gap>0?t('{n} s ahead',{n}):t('{n} s behind',{n}),tone:'warn',title}
}
function Person({m,snap,open,onToggle}:{m:Member,snap:Snap,open:boolean,onToggle:()=>void}){
 const me=m.id===snap.selfId,host=m.id===snap.members[0]?.id,st=statusOf(m,snap),speaking=snap.speaking.includes(m.id)
 const viewing=snap.view?.id===m.id,canWatch=!me&&!viewing&&streamSources(snap).some(x=>x.id===m.id)
 const volume=!me&&!!m.voice&&snap.voice==='on',kick=snap.role==='host'&&!me
 const more=canWatch||viewing||volume||kick
 return <div className={'wp-person'+(speaking?' speaking':'')+(open&&more?' open':'')}>
  <div className="wp-person-row">
   <span className="wp-avatar" style={{'--hue':nameHue(m.name)} as React.CSSProperties} aria-hidden="true">{(m.name||'?').trim().slice(0,1).toUpperCase()||'?'}</span>
   <span className={'wp-member'+(m.voice?' in-voice':'')+(speaking?' speaking':'')} title={m.voice?(m.muted?t('In the voice channel (muted)'):t('In the voice channel')):''}>{m.voice?(m.muted?<Icon name="mute" inline/>:<Icon name="mic" inline/>):''}{m.cam?<Icon name="camera" inline/>:''}{m.name}{me?' ('+t('you')+')':''}</span>
   {host&&<span className="wp-role" role="img" aria-label={t('Host')} title={t('Host')}><Icon name="crown" inline/></span>}
   {st.text&&<span className={'wp-status '+st.tone} title={st.title}>{st.text}</span>}
   {more&&<button className="wp-more" aria-expanded={open} aria-label={t('Options for {name}',{name:m.name})} title={t('Options for {name}',{name:m.name})} onClick={onToggle}><Icon name="more"/></button>}
  </div>
  {open&&more&&<div className="wp-person-more">
   {volume&&<label className="wp-vol"><Icon name="volume" inline/>{t('Their voice')}<input type="range" min={0} max={1} step={0.05} defaultValue={party.personVolume(m.id)} onChange={e=>party.setPersonVolume(m.id,Number(e.target.value))} aria-label={t('Volume of the voice of {name}',{name:m.name})}/></label>}
   {canWatch&&<button onClick={()=>{party.ownSources=false;party.watch(m.id)}}><Icon name="signal" inline/>{t('Watch their stream')}</button>}
   {viewing&&<button onClick={()=>{party.ownSources=true;party.unwatch()}}>{t('Stop watching their stream')}</button>}
   {kick&&<button className="removebtn" onClick={()=>party.kick(m.id)}>{t('Remove from the party')}</button>}
  </div>}
 </div>
}

// ---- Panel ------------------------------------------------------------------------
function useRecent():Recent[]{const[l,setL]=useState(recentParties);useEffect(()=>{const f=()=>setL(recentParties());window.addEventListener('nr-party-recent',f);return()=>window.removeEventListener('nr-party-recent',f)},[]);return l}
// Which microphone (only once the microphone is allowed: the names are hidden before).
function MicPicker(){
 const[list,setList]=useState<MediaDeviceInfo[]>([]),[cur,setCur]=useState(()=>lsGet('partyMic')||'')
 useEffect(()=>{let live=true;const load=()=>navigator.mediaDevices?.enumerateDevices?.().then(d=>{if(live)setList(d.filter(x=>x.kind==='audioinput'&&x.deviceId&&x.deviceId!=='default'&&x.deviceId!=='communications'))}).catch(()=>{});load();navigator.mediaDevices?.addEventListener?.('devicechange',load);return()=>{live=false;navigator.mediaDevices?.removeEventListener?.('devicechange',load)}},[])
 if(list.length<2)return null
 return <label className="wp-select"><span><Icon name="mic" inline/>{t('Microphone')}</span><select value={list.some(x=>x.deviceId===cur)?cur:''} onChange={e=>{setCur(e.target.value);party.setMic(e.target.value)}}><option value="">{t('System default')}</option>{list.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||t('Microphone {n}',{n:i+1})}</option>)}</select></label>
}
const hhmm=(at:number)=>{try{return new Date(at).toLocaleTimeString(getLang()==='fr'?'fr-FR':[],{hour:'2-digit',minute:'2-digit'})}catch{return''}}

export function WatchPartyPanel(){
 const[hideCams,setHideCams]=useHideCams()
 const snap=useParty(),recent=useRecent()
 const[open,setOpen]=useState(false),[name,setName]=useState(partyName),[code,setCode]=useState(''),[text,setText]=useState(''),[copied,setCopied]=useState(false),[invited,setInvited]=useState(false),[opts,setOpts]=useState(false),[qr,setQr]=useState(''),[who,setWho]=useState(''),[fixed,setFixed]=useState(roomFixed),[room,setRoom]=useState(()=>roomFixed()?roomCode():''),[,tick]=useState(0)
 const chatRef=useRef<HTMLDivElement>(null)
 // Invitation links (novelreader://party/CODE): open the panel and join.
 useEffect(()=>{const nr:any=window.novelReader;const handle=(url:string)=>{const m=/^novelreader:\/\/party\/([A-Z0-9]{6})/i.exec(String(url||''));if(!m)return;const c=m[1].toUpperCase();setCode(c);setOpen(true);if(party.snap.status==='ready'&&party.snap.code===c)return;if(partyName())party.join(c);else setTimeout(()=>(document.querySelector('.wp-field input') as HTMLInputElement|null)?.focus(),50)};nr?.takeDeepLink?.().then(handle).catch(()=>{});return nr?.onDeepLink?.(handle)},[])
 useEffect(()=>{const f=()=>setOpen(true);window.addEventListener('nr-party-open',f);return()=>window.removeEventListener('nr-party-open',f)},[])
 useEffect(()=>{party.panelOpen=open;if(open)party.seen()},[open])
 // (The screen of a watched stream leaves room for this panel on a wide window.)
 useEffect(()=>{document.body.classList.toggle('party-panel-open',open);return()=>document.body.classList.remove('party-panel-open')},[open])
 useEffect(()=>{chatRef.current?.scrollTo({top:1e9})},[snap.chat.length,snap.typing.length,open])
 // The chat keeps its last line in sight when what is above it grows or shrinks (a person's options, the QR code).
 useEffect(()=>{const el=chatRef.current;if(!el||typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(()=>el.scrollTo({top:1e9}));ro.observe(el);return()=>ro.disconnect()},[open,snap.status,opts])
 // (The words next to each name follow the players: looked at again every second.)
 useEffect(()=>{if(!open||snap.status!=='ready')return;const iv=setInterval(()=>tick(x=>x+1),1000);return()=>clearInterval(iv)},[open,snap.status])
 useEffect(()=>{if(snap.status!=='ready'){setOpts(false);setQr('');setWho('')}},[snap.status])
 if(!open)return null
 const saveName=()=>{lsSet('partyName',name.trim().slice(0,30))}
 const ready=snap.status==='ready',self=snap.selfId
 const mine=snap.presence[self],casting=snap.cast===self,caster=snap.cast&&!casting?snap.cast:''
 const sources=streamSources(snap),viewers=snap.viewers.map(id=>nameOf(snap,id))
 const toggleQr=async()=>{if(qr){setQr('');return}setQr(await inviteLink(snap.code))}
 // A <div>, not an <aside>: the rules of the side menu (aside, aside button) reached this window too.
 return <div className={'wp-panel'+(ready?' live':'')} role="dialog" aria-label={t('Watch together')}>
  <header><b><Icon name="users" inline/>{t('Watch together')}{ready&&<span className="wp-count">{snap.members.length}</span>}</b>{ready&&<button className={'wp-x wp-gear'+(opts?' on':'')} aria-label={t('Options')} title={t('Options')} aria-pressed={opts} onClick={()=>setOpts(o=>!o)}><Icon name="gear"/></button>}<button className="wp-x" aria-label={t('Minimize')} title={t('Minimize')} onClick={()=>setOpen(false)}>–</button></header>
  {!snap.role||snap.status==='error'?<div className="wp-body">
   <p className="wp-help">{t('Each person plays the video from their own sources; play, pause, position and episode are shared. Someone who does not have the video can watch the stream of a friend.')}</p>
   <label className="wp-field">{t('Your name')}<input value={name} maxLength={30} onChange={e=>setName(e.target.value)} onBlur={saveName} placeholder={t('e.g. Ali')}/></label>
   <button className="primary" disabled={snap.status==='connecting'} onClick={()=>{saveName();party.host()}}>{t('Start a watch party')}</button>
   <div className="wp-room">
    <label className="wp-check"><input type="checkbox" checked={fixed} onChange={e=>{lsSet('partyFixed',e.target.checked?'1':'0');setFixed(e.target.checked);setRoom(e.target.checked?roomCode():'')}}/> {fixed&&room?<span>{t('Always the same code:')} <b className="wp-room-code">{room}</b></span>:t('Always the same code')}</label>
    {fixed&&<button className="wp-link" onClick={()=>setRoom(roomCode(true))} title={t('Your friends will need the new code')}>{t('New code')}</button>}
   </div>
   <div className="wp-or">{t('or')}</div>
   <form className="wp-join" onSubmit={e=>{e.preventDefault();saveName();party.join(code)}}><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={7} placeholder={t('Code (6 letters)')} aria-label={t('Watch party code')}/><button type="submit" disabled={code.trim().length<6||snap.status==='connecting'}>{t('Join')}</button></form>
   {recent.length>0&&<div className="wp-recent"><span className="wp-recent-title">{t('Join again')}</span>{recent.map(r=><div className="wp-recent-row" key={r.code}><button className="wp-recent-go" disabled={snap.status==='connecting'} onClick={()=>{saveName();setCode(r.code);party.join(r.code)}}><span className="wp-avatar" style={{'--hue':nameHue(r.name)} as React.CSSProperties} aria-hidden="true">{r.name.slice(0,1).toUpperCase()}</span><span className="wp-recent-name">{t('Room of {name}',{name:r.name})}</span><code>{r.code}</code></button><button className="wp-x wp-recent-x" aria-label={t('Forget the room of {name}',{name:r.name})} title={t('Forget')} onClick={()=>forgetParty(r.code)}>×</button></div>)}</div>}
   {snap.status==='error'&&<p className="wp-error" role="alert">{snap.error}</p>}
  </div>:<div className="wp-body">
   {snap.status==='connecting'?<p className="wp-help"><span className="spinner"/> {snap.reconnecting?t('Reconnecting to the watch party…'):snap.role==='host'?t('Creating the watch party…'):t('Joining…')}</p>:opts?
    // What is chosen once and left alone has its own page (the gear), out of the way of the party.
    <div className="wp-options">
     <h3>{t('Options')}</h3>
     {snap.voice==='on'&&<><label className="wp-vol"><Icon name="volume" inline/>{t('Volume of the voices')}<input type="range" min={0} max={1} step={0.05} defaultValue={voiceVolume()} onChange={e=>party.setVolume(Number(e.target.value))} aria-label={t('Volume of the voices')}/></label><MicPicker/><label className="wp-check"><input type="checkbox" checked={snap.ptt} onChange={e=>party.setPtt(e.target.checked)}/> {t('Push to talk (hold V)')}</label><label className="wp-check"><input type="checkbox" defaultChecked={lsGet('partyDuck')!=='0'} onChange={e=>lsSet('partyDuck',e.target.checked?'1':'0')}/> {t('Lower the film while someone speaks')}</label></>}
     <label className="wp-check"><input type="checkbox" checked={hideCams} onChange={e=>setHideCams(e.target.checked)}/> {t("Hide the others' cameras")}</label>
     {snap.role==='host'&&<label className="wp-check"><input type="checkbox" defaultChecked={lsGet('partyWait')!=='0'} onChange={e=>lsSet('partyWait',e.target.checked?'1':'0')}/> {t('Wait for people whose video is loading')}</label>}
     {snap.role==='host'&&<label className="wp-check"><input type="checkbox" checked={snap.lock} onChange={e=>party.setLock(e.target.checked)}/> {t('Only I control the playback (play, pause, position)')}</label>}
     <label className="wp-check"><input type="checkbox" defaultChecked={lsGet('partyShare')!=='0'} onChange={e=>lsSet('partyShare',e.target.checked?'1':'0')}/> {t('Let the others watch my video when they do not have it')}</label>
     <label className="wp-select"><span><Icon name="signal" inline/>{t('Quality of the video I send')}</span><select defaultValue={lsGet('partyQuality')||''} onChange={e=>{lsSet('partyQuality',e.target.value);party.retune()}}><option value="">{t('Automatic')}</option>{Object.keys(STREAM_QUALITY).map(q=><option key={q} value={q}>{q}p</option>)}</select></label>
     <label className="wp-check"><input type="checkbox" defaultChecked={partySoundsOn()} onChange={e=>lsSet('partySounds',e.target.checked?'1':'0')}/> {t('Sounds of the party (someone comes in, leaves, a message)')}</label>
     {snap.voice==='on'&&<p className="wp-hint">{t('Tip: use headphones so the film does not come back through your microphone.')}</p>}
     <button onClick={()=>setOpts(false)}>{'← '+t('Back')}</button>
    </div>:<>
    {/* What is set once stays on top and scrolls if it must; the chat takes the rest and the message field stays in sight. */}
    <div className="wp-top">
    {/* The code, the invitation and its QR code on one row. */}
    <div className="wp-share">
     <div className="wp-code" title={t('Code of the watch party')}><b aria-label={t('Code')+' '+snap.code}>{snap.code}</b><button className="wp-ico" aria-label={t('Copy the code')} title={t('Copy the code')} onClick={()=>{navigator.clipboard?.writeText(snap.code).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000)}}>{copied?'✓':<Icon name="copy"/>}</button></div>
     <button className="wp-invite" aria-label={t('Copy an invitation link')} title={t('Copy an invitation link')} onClick={async()=>{const text=await inviteText(snap.code);navigator.clipboard?.writeText(text).catch(()=>{});(window as any).__lastInvite=text;setInvited(true);setTimeout(()=>setInvited(false),3000)}}><Icon name="link" inline/>{t('Invite')}</button>
     <button className={'wp-qr-btn'+(qr?' on':'')} aria-label={t('QR code for a phone')} title={t('QR code for a phone')} aria-pressed={!!qr} onClick={toggleQr}><Icon name="qr"/></button>
    </div>
    {invited&&<div className="wp-copied" role="status">{'✓ '+t('Invitation copied: paste it in Discord, WhatsApp…')}</div>}
    {qr&&<div className="wp-qr"><QrCode text={qr} size={132} label={t('QR code of the invitation')}/><span>{t('Scan it with the phone: the invitation opens and NovelReader joins the party.')}</span></div>}
    {/* What this person needs first: they do not have the video (watch a friend's, or install the source). */}
    {snap.missing&&!snap.view&&<div className="wp-missing" role="status"><p>{t('You do not have the source "{name}". NovelReader looks for the same episode in your other sources.',{name:snap.missing.sourceName||'?'})}</p><div className="wp-missing-actions">{sources.length>0&&<button className="primary" onClick={()=>{party.ownSources=false;party.watch(sources[0].id)}}><Icon name="signal" inline/>{t('Watch the stream of {name}',{name:sources[0].name})}</button>}<button className={sources.length?'':'primary'} disabled={snap.missingState==='installing'} onClick={()=>party.installMissing()}>{snap.missingState==='installing'?t('Installing…'):t('Install {name}',{name:snap.missing.sourceName||t('the source')})}</button></div>{snap.missingError&&<p className="wp-error">{snap.missingError}</p>}</div>}
    <div className="wp-people" role="group" aria-label={plural(snap.members.length,'{n} person','{n} people')}>{snap.members.map(m=><Person key={m.id} m={m} snap={snap} open={who===m.id} onToggle={()=>setWho(w=>w===m.id?'':m.id)}/>)}</div>
    {/* Voice, camera, stream: one row of buttons (their full names are read out and shown on hover). */}
    <div className="wp-tools" role="toolbar" aria-label={t('Voice, camera and stream')}>
     {snap.voice==='off'&&<button className="wp-tool" onClick={()=>party.voiceJoin()} aria-label={t('Join the voice channel')} title={t('Join the voice channel')}><Icon name="mic"/><span>{t('Voice chat')}</span></button>}
     {snap.voice==='joining'&&<button className="wp-tool" disabled aria-label={t('Allowing the microphone…')} title={t('Allowing the microphone…')}><span className="spinner" aria-hidden="true"/><span>{t('Voice chat')}</span></button>}
     {snap.voice==='on'&&<><button className={'wp-tool on'+(snap.muted?' off':'')} aria-pressed={snap.muted} aria-label={snap.muted?t('Unmute'):t('Mute')} title={snap.muted?t('Unmute'):t('Mute')} onClick={()=>party.setMuted(!snap.muted)}><Icon name={snap.muted?'micoff':'mic'}/><span>{snap.muted?t('Muted'):t('Mic on')}</span></button>
      <button className="wp-tool leave" aria-label={t('Leave the voice channel')} title={t('Leave the voice channel')} onClick={()=>party.voiceLeave()}><Icon name="hangup"/><span>{t('Hang up')}</span></button></>}
     <button className={'wp-tool'+(snap.cam==='on'?' on':'')} disabled={snap.cam==='starting'} aria-pressed={snap.cam==='on'} aria-label={snap.cam==='on'?t('Turn my camera off'):snap.cam==='starting'?t('Allowing the camera…'):t('Turn my camera on')} title={snap.cam==='on'?t('Turn my camera off'):t('Turn my camera on')} onClick={()=>snap.cam==='on'?party.camStop():party.camStart()}>{snap.cam==='starting'?<span className="spinner" aria-hidden="true"/>:<Icon name="camera"/>}<span>{t('Camera')}</span></button>
     {snap.v2&&<button className={'wp-tool'+(casting?' on':'')} aria-pressed={casting} disabled={!casting&&(!mine?.can||!!caster)} aria-label={casting?t('Stop sending my video'):t('Send my video to everyone')} title={casting?t('Stop sending my video'):caster?t('{name} is already sending their video.',{name:nameOf(snap,caster)}):!mine?.can?t('Open an episode first: your video is what the others will see.'):t('Send my video to everyone: the others watch your picture and sound instead of loading the video themselves.')} onClick={()=>casting?party.castStop():party.castStart()}><Icon name="signal"/><span>{t('Stream')}</span></button>}
    </div>
    {snap.voice==='on'&&snap.ptt&&<span className={'wp-ptt'+(snap.talking?' on':'')} role="status">{snap.talking?<><Icon name="mic" inline/>{t('Talking…')}</>:t('Microphone off until you hold V')}</span>}
    {snap.voiceError&&<p className="wp-error" role="alert">{snap.voiceError}</p>}
    {snap.camError&&<p className="wp-error" role="alert">{snap.camError}</p>}
    {/* The stream: who sends, who watches, and the way back to it. */}
    {casting?<div className="wp-stream on" role="status"><Icon name="signal" inline/><span>{viewers.length?plural(viewers.length,'Your video is sent to everyone: {n} person watches it.','Your video is sent to everyone: {n} people watch it.'):t('Your video is sent to everyone: the others are connecting…')}</span></div>
     :viewers.length?<div className="wp-stream on" role="status"><Icon name="signal" inline/><span>{viewers.length===1?t('{name} is watching your video.',{name:viewers[0]}):t('{names} are watching your video.',{names:viewers.join(', ')})}</span></div>
     :snap.view?<div className="wp-stream" role="status"><Icon name="signal" inline/><span>{t('You are watching the stream of {name}.',{name:nameOf(snap,snap.view.id)})}</span><button onClick={()=>{party.ownSources=true;party.unwatch()}}>{t('Stop')}</button></div>
     :caster?<div className="wp-stream" role="status"><Icon name="signal" inline/><span>{t('{name} is sending their video to everyone.',{name:nameOf(snap,caster)})}</span><button className="primary" onClick={()=>{party.ownSources=false;party.watch(caster)}}>{t('Watch')}</button></div>:null}
    </div>
    {snap.state?.media?<div className="wp-now"><span className="wp-now-title">▶ {snap.state.media.name}{snap.state.episodeName&&snap.state.media.kind!=='movie'?' · '+snap.state.episodeName:''}</span>{snap.lock&&<span className="wp-lock" role="img" aria-label={t('Only the host controls the playback.')} title={t('Only the host controls the playback.')}><Icon name="lock" inline/></span>}</div>:<div className="wp-now muted">{t('Open an episode: everyone will follow.')}</div>}
    <div className="wp-chat" ref={chatRef}>{snap.chat.map((c,i)=><div key={i} className={'wp-msg'+(c.mine?' mine':'')+(c.system?' system':'')+(c.old?' old':'')}>{c.system?c.text:<><b>{c.name}</b> {c.text}<time className="wp-time">{hhmm(c.at)}</time></>}</div>)}
     {snap.typing.length>0&&<div className="wp-typing" role="status">{snap.typing.length===1?t('{name} is writing…',{name:snap.typing[0].name}):t('{names} are writing…',{names:snap.typing.map(x=>x.name).join(', ')})}</div>}</div>
    <form className="wp-say" onSubmit={e=>{e.preventDefault();party.say(text);setText('')}}><input value={text} maxLength={500} onChange={e=>{setText(e.target.value);if(e.target.value.trim())party.typing()}} placeholder={t('Message…')} aria-label={t('Message')}/><button type="submit" disabled={!text.trim()}>{t('Send')}</button></form>
   </>}
   {!(ready&&opts)&&<div className="wp-leaves">{snap.role==='host'&&snap.members.length>1&&<button aria-label={t('Leave ({name} becomes the host)',{name:snap.members[1].name})} title={t('Leave ({name} becomes the host)',{name:snap.members[1].name})} onClick={()=>party.handOver()}>{t('Leave')}</button>}<button className="removebtn wp-leave" aria-label={snap.role==='host'?t('End the watch party'):t('Leave')} onClick={()=>party.leave()}>{snap.role==='host'?(snap.members.length>1?t('End for everyone'):t('End the watch party')):t('Leave')}</button></div>}
  </div>}
 </div>
}

// ---- Over the video: reactions, who did what, countdown, chat in fullscreen ----------
// During a party the whole player (video + this layer) goes fullscreen instead of
// the bare video, so the chat and the reactions stay visible. The same layer sits on
// the picture of someone's stream (features/party-theater.tsx).
type Fly={id:number,emoji:string,name:string,x:number}
const findStage=()=>(document.querySelector('.party-theater .pt-stage')||document.querySelector('.media-player-top .player-stage')) as HTMLElement|null
export function PartyOverlay(){
 const snap=useParty(),active=snap.status==='ready'
 const[stage,setStage]=useState<HTMLElement|null>(null),[full,setFull]=useState(false),[flies,setFlies]=useState<Fly[]>([]),[typing,setTyping]=useState(false),[text,setText]=useState(''),[since]=useState(()=>Date.now()),[,tick]=useState(0),[toast,setToast]=useState<{id:number,text:string}|null>(null)
 const inputRef=useRef<HTMLInputElement>(null),seq=useRef(0),said=useRef(-1)
 // A narrow picture (a phone held upright): the reactions open from one button, and close by themselves.
 const[narrow,setNarrow]=useState(false),[emo,setEmo]=useState(false),[emoAt,setEmoAt]=useState(0)
 useEffect(()=>{if(!stage||typeof ResizeObserver==='undefined')return;const f=()=>setNarrow(stage.clientWidth<520);f();const ro=new ResizeObserver(f);ro.observe(stage);return()=>ro.disconnect()},[stage])
 useEffect(()=>{if(!emo)return;const tm=setTimeout(()=>setEmo(false),5000);return()=>clearTimeout(tm)},[emo,emoAt])
 // Find the player (it comes and goes with the pages).
 useEffect(()=>{if(!active){setStage(null);return}const look=()=>setStage(findStage());look();const iv=setInterval(look,1000);return()=>clearInterval(iv)},[active,!!snap.view])
 // Full screen is the whole player (features/player-full.ts), so this layer stays over the picture.
 // Where the player keeps the system's full screen (Android), the video's own button would
 // hide this layer: ours takes its place, on the picture's frame.
 useEffect(()=>{if(!stage||shellOf(stage))return;const v=stage.querySelector('video') as any;if(!v?.controlsList)return;v.controlsList.add('nofullscreen');const dbl=(e:MouseEvent)=>{if((e.target as HTMLElement).closest('.po-bar,.po-say,.pt-bar,.pt-top,.pt-veil'))return;e.preventDefault();toggleFull()};stage.addEventListener('dblclick',dbl);return()=>{v.controlsList.remove('nofullscreen');stage.removeEventListener('dblclick',dbl)}},[stage])
 useEffect(()=>{const f=()=>{const fs=document.fullscreenElement;setFull(!!stage&&!!fs&&(fs===stage||(fs===fullShell()&&fs.contains(stage))))};f();document.addEventListener('fullscreenchange',f);return()=>document.removeEventListener('fullscreenchange',f)},[stage])
 useEffect(()=>party.onReact(r=>{const id=++seq.current;setFlies(fs=>[...fs.slice(-24),{id,emoji:r.emoji,name:r.mine?'':r.name,x:8+Math.random()*30}]);setTimeout(()=>setFlies(fs=>fs.filter(f=>f.id!==id)),3200)}),[])
 // Who did what ("Ali paused"): a line at the top of the picture for a moment.
 useEffect(()=>party.onToast(text=>{const id=++seq.current;setToast({id,text});setTimeout(()=>setToast(cur=>cur?.id===id?null:cur),2600)}),[])
 // Chat lines fade out after 10 s; the countdown moves ten times a second.
 const counting=!!snap.count
 useEffect(()=>{if(!full&&!counting)return;const iv=setInterval(()=>tick(x=>x+1),counting?100:1000);return()=>clearInterval(iv)},[full,counting])
 // In fullscreen: Enter (or T) to write a message.
 useEffect(()=>{if(!full)return;const k=(e:KeyboardEvent)=>{if(typing||e.ctrlKey||e.altKey||e.metaKey)return;if(e.key==='Enter'||e.key==='t'||e.key==='T'){if((e.target as HTMLElement)?.tagName==='INPUT')return;e.preventDefault();setTyping(true)}};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[full,typing])
 useEffect(()=>{if(typing)setTimeout(()=>inputRef.current?.focus(),0)},[typing])
 function toggleFull(){if(!stage||togglePlayerFull(stage))return;if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else stage.requestFullscreen().catch(()=>{})}
 // "3, 2, 1": the number left, then "Go" for a second.
 const left=snap.count?(snap.count.at-(party.hostNow()??Date.now()))/1000:0,num=snap.count?(left>0?Math.ceil(left):0):-1
 useEffect(()=>{if(num===said.current)return;said.current=num;if(num>0)partySound('tick');else if(num===0)partySound('go')},[num])
 if(!active||!stage)return null
 const recent=snap.chat.filter(c=>!c.act&&!c.old&&c.at>=since&&Date.now()-c.at<10000).slice(-4)
 const voices=snap.voice==='on'?snap.speaking.filter(id=>id!==snap.selfId).map(id=>nameOf(snap,id)):[]
 return createPortal(<div className={'party-overlay'+(full?' full':'')}>
  <div className="po-flies" aria-hidden="true">{flies.map(f=><span key={f.id} className="po-fly" style={{left:f.x+'%'}}>{f.emoji}{f.name&&<small>{f.name}</small>}</span>)}</div>
  {toast&&<div className="po-toast" role="status" key={toast.id}>{toast.text}</div>}
  {voices.length>0&&<div className="po-voices" aria-hidden="true">{voices.map(n=><span key={n} className="po-voice"><Icon name="mic" inline/>{n}</span>)}</div>}
  {snap.count&&num>=0&&<div className="po-count" role="status" aria-label={num>0?String(num):t('Go!')}><b key={num}>{num>0?num:t('Go!')}</b><small>{t('{name} starts the video',{name:snap.count.name})}</small></div>}
  {full&&(recent.length>0||typing)&&<div className="po-chat">{recent.map((c,i)=><div key={c.at+':'+i} className={'po-line'+(c.system?' system':'')}>{c.system?c.text:<><b>{c.mine?t('You'):c.name}</b> {c.text}</>}</div>)}
   {typing&&<form className="po-say" onSubmit={e=>{e.preventDefault();party.say(text);setText('');setTyping(false)}}><input ref={inputRef} value={text} maxLength={500} onChange={e=>setText(e.target.value)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){setTyping(false);setText('')}}} onBlur={()=>{if(!text)setTyping(false)}} placeholder={t('Message to the party…')} aria-label={t('Message to the party')}/></form>}</div>}
  {/* On a narrow picture (phone) the reactions fold behind one button: the bar stays as wide as the screen allows. */}
  <div className={'po-bar'+(narrow?' compact':'')}>{narrow?<button className={'po-emo'+(emo?' on':'')} aria-expanded={emo} aria-label={t('Reactions')} title={t('Reactions')} onClick={()=>setEmo(x=>!x)}>{REACTIONS[0]}</button>:REACTIONS.map(e=><button key={e} onClick={()=>party.react(e)} aria-label={t('React {emoji}',{emoji:e})}>{e}</button>)}
   {narrow&&emo&&<div className="po-emos" role="group" aria-label={t('Reactions')}>{REACTIONS.map(e=><button key={e} onClick={()=>{party.react(e);setEmoAt(Date.now())}} aria-label={t('React {emoji}',{emoji:e})}>{e}</button>)}</div>}
   {snap.v2&&party.canControl()&&!!snap.state?.media&&<button onClick={()=>party.countdown()} disabled={counting} title={t('Start together: 3, 2, 1')} aria-label={t('Start together: 3, 2, 1')}><Icon name="timer"/></button>}
   <button onClick={()=>{if(full)setTyping(true);else openPanel()}} title={full?t('Write a message (Enter)'):t('Open the chat')} aria-label={t('Chat')}><Icon name="chat"/>{!full&&snap.unread>0&&<span className="po-badge">{snap.unread}</span>}</button>
   <button onClick={toggleFull} title={full?t('Exit fullscreen'):t('Fullscreen with the party chat (F)')} aria-label={full?t('Exit fullscreen'):t('Fullscreen')}><Icon name={full?'minimize':'maximize'}/></button></div>
 </div>,stage)
}

// ---- Camera bubbles ----------------------------------------------------------------
const hideCamsOn=()=>lsGet('partyHideCams')==='1'
export function useHideCams():[boolean,(v:boolean)=>void]{const[v,setV]=useState(hideCamsOn);useEffect(()=>{const f=()=>setV(hideCamsOn());window.addEventListener('nr-party-cams',f);return()=>window.removeEventListener('nr-party-cams',f)},[]);return[v,(x:boolean)=>{lsSet('partyHideCams',x?'1':'0');window.dispatchEvent(new Event('nr-party-cams'))}]}
function CamVideo({stream,mirror}:{stream:MediaStream,mirror?:boolean}){return <video className={mirror?'mirror':''} autoPlay muted playsInline ref={el=>{if(el&&el.srcObject!==stream){el.srcObject=stream;el.play().catch(()=>{})}}}/>}
// Small round videos in a corner; drag the group to move it, click one to enlarge it.
// In fullscreen they are drawn inside the fullscreen player.
export function PartyCams(){
 const snap=useParty(),[hide]=useHideCams(),[big,setBig]=useState(''),[fs,setFs]=useState<Element|null>(null)
 const[pos,setPos]=useState<{x:number,y:number}>(()=>{try{return JSON.parse(lsGet('partyCamsPos')||'null')||{x:-1,y:-1}}catch{return{x:-1,y:-1}}})
 const drag=useRef<{dx:number,dy:number,moved:boolean}|null>(null),dragged=useRef(false)
 useEffect(()=>{const f=()=>setFs(document.fullscreenElement);document.addEventListener('fullscreenchange',f);return()=>document.removeEventListener('fullscreenchange',f)},[])
 if(snap.status!=='ready')return null
 const name=(id:string)=>snap.members.find(m=>m.id===id)?.name||''
 const list=[...(snap.camLocal?[{id:snap.selfId,stream:snap.camLocal,me:true}]:[]),...(hide?[]:snap.cams.map(c=>({...c,me:false})))]
 if(!list.length)return null
 const style:React.CSSProperties=pos.x<0?{}:{left:pos.x,top:pos.y,right:'auto'}
 const down=(e:React.PointerEvent)=>{const r=(e.currentTarget as HTMLElement).getBoundingClientRect();drag.current={dx:e.clientX-r.left,dy:e.clientY-r.top,moved:false}}
 // Capture the pointer only once it really moves, so a plain click still reaches a bubble.
 const move=(e:React.PointerEvent)=>{const d=drag.current;if(!d)return;const r=(e.currentTarget as HTMLElement).getBoundingClientRect(),x=Math.max(0,Math.min(window.innerWidth-80,e.clientX-d.dx)),y=Math.max(0,Math.min(window.innerHeight-80,e.clientY-d.dy));if(!d.moved&&Math.abs(x-r.left)+Math.abs(y-r.top)<=4)return;if(!d.moved){d.moved=true;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}setPos({x,y})}
 const up=()=>{const d=drag.current;drag.current=null;dragged.current=!!d?.moved;if(d?.moved)lsSet('partyCamsPos',JSON.stringify(pos))}
 const node=<div className={'party-cams'+(fs?' in-full':'')} style={style} onPointerDown={down} onPointerMove={move} onPointerUp={up} aria-label={t('Cameras')}>
  {list.map(c=><figure key={c.id} className={'cam-bubble'+(big===c.id?' big':'')+(snap.speaking.includes(c.id)?' speaking':'')} onClick={()=>{if(dragged.current){dragged.current=false;return}setBig(b=>b===c.id?'':c.id)}} title={c.me?t('You'):name(c.id)}>
   <CamVideo stream={c.stream} mirror={c.me}/>{!c.me&&c.live===false&&<span className="cam-wait" role="status" title={t('Waiting for the picture…')}><b>{(name(c.id)||'?').slice(0,1).toUpperCase()}</b><span className="spinner" aria-hidden="true"/></span>}<figcaption>{c.me?t('You'):name(c.id)}</figcaption></figure>)}
 </div>
 return createPortal(node,(fs as HTMLElement)||document.body)
}
