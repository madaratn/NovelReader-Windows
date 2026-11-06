// Watch party: watch an anime, a series or a movie together on several PCs.
// Each PC plays the video from its own sources; NovelReader keeps the same
// episode, play / pause and position everywhere, with a small chat.
// Connection: the free public PeerJS server only introduces the PCs (6-letter
// code), then they talk directly (WebRTC). The host relays to every guest.
import React,{useEffect,useRef,useState}from'react'
import{t,plural}from'../i18n'
import{lsGet,lsSet}from'../lib/util'

export type PartyMedia={kind:'anime'|'series'|'movie',sourceId:string,sourceName?:string,url:string,name:string,cover?:string,id?:string}
export type PartyState={media:PartyMedia|null,episodeUrl:string,episodeName:string,playing:boolean,time:number,rate:number,by:string}
type Msg={t:'hello',name:string}|{t:'members',list:{id:string,name:string}[]}|{t:'state',s:PartyState}|{t:'chat',name:string,text:string,at:number}|{t:'bye'}
type Conn={id:string,send:(m:Msg)=>void,onMessage:(cb:(m:Msg)=>void)=>void,onClose:(cb:()=>void)=>void,close:()=>void}
type Transport={host:(code:string,onConn:(c:Conn)=>void)=>Promise<void>,join:(code:string)=>Promise<Conn>,destroy:()=>void}

// ---- Transports ------------------------------------------------------------------
const PREFIX='novelreader-wp-'
async function peerTransport():Promise<Transport>{
 const{default:Peer}=await import('peerjs')
 let peer:any=null
 const wrap=(c:any):Conn=>({id:String(c.peer),send:m=>{try{c.open&&c.send(m)}catch{}},onMessage:cb=>c.on('data',(d:any)=>cb(d as Msg)),onClose:cb=>{c.on('close',cb);c.on('error',cb)},close:()=>{try{c.close()}catch{}}})
 const failure=(e:any)=>new Error(e?.type==='peer-unavailable'?t('No watch party with this code. Check the code with your friend.'):e?.type==='unavailable-id'?'taken':e?.type==='network'||e?.type==='server-error'||e?.type==='socket-error'?t('Could not reach the connection server. Check your internet connection.'):String(e?.message||e))
 return{
  host:(code,onConn)=>new Promise((res,rej)=>{peer=new Peer(PREFIX+code.toLowerCase(),{debug:0});peer.on('open',()=>res());peer.on('error',(e:any)=>rej(failure(e)));peer.on('connection',(c:any)=>c.on('open',()=>onConn(wrap(c))))}),
  join:code=>new Promise((res,rej)=>{peer=new Peer({debug:0});peer.on('error',(e:any)=>rej(failure(e)));peer.on('open',()=>{const c=peer.connect(PREFIX+code.toLowerCase(),{reliable:true});c.on('open',()=>res(wrap(c)));setTimeout(()=>rej(new Error(t('No answer from this watch party. Check the code with your friend.'))),15000)})}),
  destroy:()=>{try{peer?.destroy()}catch{}peer=null}
 }
}
// Tests: two windows of the same browser talk through a BroadcastChannel.
function fakeTransport():Transport{
 let chans:BroadcastChannel[]=[]
 const me=Math.random().toString(36).slice(2,8)
 const pipe=(name:string,peerId:string):Conn=>{const ch=new BroadcastChannel(name);chans.push(ch);let onMsg:(m:Msg)=>void=()=>{},onClose:()=>void=()=>{};ch.onmessage=e=>{const d=e.data;if(d.from===me)return;if(d.bye)onClose();else onMsg(d.m)};return{id:peerId,send:m=>ch.postMessage({from:me,m}),onMessage:cb=>{onMsg=cb},onClose:cb=>{onClose=cb},close:()=>{ch.postMessage({from:me,bye:1});ch.close()}}}
 return{
  host:async(code,onConn)=>{const lobby=new BroadcastChannel('wp-'+code);chans.push(lobby);lobby.onmessage=e=>{if(e.data?.knock){const c=pipe('wp-'+code+'-'+e.data.knock,e.data.knock);lobby.postMessage({welcome:e.data.knock});onConn(c)}}},
  join:code=>new Promise((res,rej)=>{const lobby=new BroadcastChannel('wp-'+code);chans.push(lobby);const tm=setTimeout(()=>rej(new Error(t('No watch party with this code. Check the code with your friend.'))),1500);lobby.onmessage=e=>{if(e.data?.welcome===me){clearTimeout(tm);res(pipe('wp-'+code+'-'+me,'host'))}};lobby.postMessage({knock:me})}),
  destroy:()=>{for(const c of chans)try{c.close()}catch{}chans=[]}
 }
}

// ---- Party (one per window, survives page changes) -------------------------------
type Chat={name:string,text:string,at:number,mine?:boolean,system?:boolean}
type Snapshot={role:''|'host'|'guest',code:string,status:'idle'|'connecting'|'ready'|'error',error:string,members:{id:string,name:string}[],chat:Chat[],unread:number,state:PartyState|null,stateAt:number}
const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode=()=>Array.from({length:6},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('')
export const partyName=()=>lsGet('partyName')||''

class Party{
 snap:Snapshot={role:'',code:'',status:'idle',error:'',members:[],chat:[],unread:0,state:null,stateAt:0}
 private subs=new Set<()=>void>()
 private transport:Transport|null=null
 private conns:Conn[]=[]
 private names=new Map<string,string>()
 onRemoteState:((s:PartyState)=>void)|null=null
 panelOpen=false
 subscribe(f:()=>void){this.subs.add(f);return()=>{this.subs.delete(f)}}
 private set(p:Partial<Snapshot>){this.snap={...this.snap,...p};for(const f of this.subs)f()}
 private async make(){return (window as any).__partyFake?fakeTransport():await peerTransport()}
 private myName=''
 private me(){return this.myName||partyName()||t('Guest')}
 private system(text:string){this.addChat({name:'',text,at:Date.now(),system:true})}
 private addChat(c:Chat){this.set({chat:[...this.snap.chat,c].slice(-200),unread:this.panelOpen||c.mine||c.system?this.snap.unread:this.snap.unread+1})}
 async host(){
  this.leave();this.myName=partyName()||t('Guest');this.set({role:'host',status:'connecting',error:'',members:[{id:'me',name:this.me()}],chat:[]})
  for(let i=0;i<4;i++){const code=newCode();try{this.transport=await this.make();await this.transport.host(code,c=>this.accept(c));this.set({code,status:'ready'});this.system(t('Watch party created. Share the code {code}.',{code}));return}catch(e:any){this.transport?.destroy();if(e?.message!=='taken'){this.set({status:'error',error:String(e?.message||e),role:''});return}}}
 }
 async join(code:string){
  const c=code.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length!==6){this.set({status:'error',error:t('The code has 6 letters or numbers.')});return}
  this.leave();this.myName=partyName()||t('Guest');this.set({role:'guest',code:c,status:'connecting',error:'',chat:[]})
  try{this.transport=await this.make();const conn=await this.transport.join(c);this.conns=[conn];conn.onMessage(m=>this.receive(m,conn));conn.onClose(()=>{if(this.snap.role==='guest')this.leave(t('The host closed the watch party.'))});conn.send({t:'hello',name:this.me()});this.set({status:'ready'})}
  catch(e:any){this.transport?.destroy();this.transport=null;this.set({status:'error',error:String(e?.message||e),role:''})}
 }
 private accept(c:Conn){
  this.conns.push(c);c.onMessage(m=>this.receive(m,c))
  c.onClose(()=>{this.conns=this.conns.filter(x=>x!==c);const n=this.names.get(c.id);this.names.delete(c.id);if(n)this.system(t('{name} left.',{name:n}));this.sendMembers()})
 }
 private sendMembers(){const list=[{id:'me',name:this.me()},...this.conns.map(c=>({id:c.id,name:this.names.get(c.id)||'…'}))];this.set({members:list});for(const c of this.conns)c.send({t:'members',list})}
 private receive(m:Msg,from:Conn){
  if(m.t==='hello'&&this.snap.role==='host'){this.names.set(from.id,String(m.name||t('Guest')).slice(0,30));this.system(t('{name} joined.',{name:this.names.get(from.id)!}));this.sendMembers();if(this.snap.state)from.send({t:'state',s:this.snap.state})}
  else if(m.t==='members'){this.set({members:m.list})}
  else if(m.t==='chat'){this.addChat({name:m.name,text:String(m.text).slice(0,500),at:m.at});if(this.snap.role==='host')this.relay(m,from)}
  else if(m.t==='state'){this.set({state:m.s,stateAt:Date.now()});this.onRemoteState?.(m.s);if(this.snap.role==='host')this.relay(m,from)}
 }
 private relay(m:Msg,from:Conn){for(const c of this.conns)if(c!==from)c.send(m)}
 private broadcast(m:Msg){for(const c of this.conns)c.send(m)}
 say(text:string){const x=text.trim().slice(0,500);if(!x||this.snap.status!=='ready')return;const m:Msg={t:'chat',name:this.me(),text:x,at:Date.now()};this.addChat({name:m.name,text:x,at:m.at,mine:true});this.broadcast(m)}
 share(s:Omit<PartyState,'by'>){if(this.snap.status!=='ready')return;const st={...s,by:this.me()};this.set({state:st,stateAt:Date.now()});this.broadcast({t:'state',s:st})}
 seen(){if(this.snap.unread)this.set({unread:0})}
 leave(error=''){for(const c of this.conns)c.close();this.conns=[];this.names.clear();this.transport?.destroy();this.transport=null;this.set({role:'',status:error?'error':'idle',error,members:[],state:null,code:''})}
}
export const party=new Party()
export function useParty(){const[,bump]=useState(0);useEffect(()=>party.subscribe(()=>bump(x=>x+1)),[]);return party.snap}

// ---- Bridge: follows the player of this window ---------------------------------
// current(): what this window is playing; open(): show the same title/episode.
export function WatchPartyBridge({current,open}:{current:()=>{media:PartyMedia,episodeUrl:string,episodeName:string}|null,open:(media:PartyMedia,episodeUrl:string)=>void}){
 const snap=useParty(),curRef=useRef(current),openRef=useRef(open);curRef.current=current;openRef.current=open
 const enforce=useRef<{until:number,s:PartyState|null}>({until:0,s:null}),quietUntil=useRef(0),pending=useRef<PartyState|null>(null),pendingAt=useRef(0),lastEp=useRef(''),seq=useRef(0)
 const active=snap.status==='ready'
 const sameEp=(s:PartyState)=>{const c=curRef.current();return!!c&&!!s.media&&c.media.sourceId===s.media.sourceId&&c.media.url===s.media.url&&c.episodeUrl===s.episodeUrl}
 const video=()=>document.querySelector('.media-player-top video') as HTMLVideoElement|null
 // Changes made here on behalf of someone else are not sent back (expected events are consumed).
 const expect_=useRef<{seek:number|null,play:number,pause:number,rate:number}>({seek:null,play:0,pause:0,rate:0})
 const apply=(s:PartyState)=>{const v=video();if(!v||!sameEp(s))return false;const ex=expect_.current
  const target=s.time+(s.playing?0.25:0);if(Math.abs(v.currentTime-target)>1.5){ex.seek=target;v.currentTime=target}
  if(s.rate&&v.playbackRate!==s.rate){ex.rate++;v.playbackRate=s.rate}
  if(s.playing&&v.paused){ex.play++;v.play().catch(()=>{ex.play=Math.max(0,ex.play-1)})}if(!s.playing&&!v.paused){ex.pause++;v.pause()}
  enforce.current={until:Date.now()+3000,s} // the player may start playing by itself right after loading
  return true}
 useEffect(()=>{
  party.onRemoteState=s=>{if(!s.media)return;seq.current++;if(sameEp(s)){const v=video();if(v&&v.readyState>=1&&apply(s))pending.current=null;else{pending.current=s;pendingAt.current=Date.now()}return}pending.current=s;pendingAt.current=Date.now();quietUntil.current=Date.now()+15000;lastEp.current=s.media.sourceId+'|'+s.media.url+'|'+s.episodeUrl;openRef.current(s.media,s.episodeUrl)}
  return()=>{party.onRemoteState=null}
 },[])
 useEffect(()=>{if(!active)return
  let attached:HTMLVideoElement|null=null,hb:any=0
  const send=(e?:Event)=>{const v=attached,c=curRef.current();if(!v||!c)return;const ex=expect_.current,type=e?.type
   if(type==='seeked'&&ex.seek!=null&&Math.abs(v.currentTime-ex.seek)<0.6){ex.seek=null;return}
   if(type==='play'&&ex.play>0){ex.play--;return}
   // The player can restart playback by itself (stall recovery, autoplay): without a
   // click or key press, keep the group's pause instead of un-pausing everyone.
   if(type==='play'&&Date.now()-lastInput>1000){const st=party.snap.state;if(st&&!st.playing&&sameEp(st)){ex.pause++;v.pause();return}}
   if(type==='pause'&&ex.pause>0){ex.pause--;return}
   if(type==='ratechange'&&ex.rate>0){ex.rate--;return}
   if(Date.now()<quietUntil.current)return
   // A video that just loaded jumps to its own saved position and may start by itself: not a user action.
   if(e&&(!settled||Date.now()<settled)&&Date.now()-attachAt<4000)return
   party.share({media:c.media,episodeUrl:c.episodeUrl,episodeName:c.episodeName,playing:!v.paused,time:v.currentTime,rate:v.playbackRate})}
  const evs=['play','pause','seeked','ratechange']
  let attachAt=0,settled=0,lastInput=0;const onCanPlay=()=>{if(!settled)settled=Date.now()+250}
const onInput=()=>{lastInput=Date.now()};window.addEventListener('pointerdown',onInput,true);window.addEventListener('keydown',onInput,true);window.addEventListener('nr-user-input',onInput)
  const iv=setInterval(()=>{const v=video();if(v!==attached){for(const e of evs)attached?.removeEventListener(e,send);const replaced=!!attached;attached?.removeEventListener('canplay',onCanPlay);attached=v;attachAt=Date.now();settled=v&&v.readyState>=3?Date.now():0;v?.addEventListener('canplay',onCanPlay);if(v)for(const e of evs)v.addEventListener(e,send)
    // The player rebuilt its video (stream switch, reload): put it back on the group's state.
    const st=party.snap.state;if(v&&replaced&&st&&sameEp(st)&&!pending.current){pending.current=st;pendingAt.current=party.snap.stateAt||Date.now()}}
   const c=curRef.current();if(!v||!c)return
   const en=enforce.current;if(en.s&&Date.now()<en.until&&sameEp(en.s)){const ex=expect_.current;if(!en.s.playing&&!v.paused){ex.pause++;v.pause()}}
   const key=c.media.sourceId+'|'+c.media.url+'|'+c.episodeUrl
   // Following someone: wait for the video, then apply their state, and once more a
   // moment later (the player may jump to its own saved position meanwhile).
   if(pending.current&&sameEp(pending.current)&&v.readyState>=1){const p=pending.current,elapsed=(Date.now()-pendingAt.current)/1000;const st={...p,time:p.time+(p.playing?elapsed:0)};if(apply(st)){pending.current=null;quietUntil.current=0;const mine=seq.current;setTimeout(()=>{if(seq.current!==mine)return;const again={...st,time:st.time+(st.playing?1.5:0)};apply(again)},1500)}}
   else if(key!==lastEp.current&&!pending.current){lastEp.current=key;send()} // a new episode chosen here
  },400)
  // Host heartbeat: keeps everyone within ~1.5 s while playing.
  if(snap.role==='host')hb=setInterval(()=>{if(attached&&!attached.paused&&Date.now()>=quietUntil.current)send()},5000)
  return()=>{clearInterval(iv);clearInterval(hb);attached?.removeEventListener('canplay',onCanPlay);window.removeEventListener('pointerdown',onInput,true);window.removeEventListener('keydown',onInput,true);window.removeEventListener('nr-user-input',onInput);for(const e of evs)attached?.removeEventListener(e,send)}
 },[active,snap.role])
 return null
}

// ---- Panel ------------------------------------------------------------------------
export function WatchPartyButton(){
 const snap=useParty()
 return <button className={'nav-item subtle wp-open'+(snap.status==='ready'?' live':'')} onClick={()=>{party.panelOpen=true;party.seen();window.dispatchEvent(new Event('nr-party-open'))}} title={t('Watch together')}>
  <span className="wp-icon" aria-hidden="true">👥</span><span className="label">{snap.status==='ready'?t('Watch party · {code}',{code:snap.code}):t('Watch together')}</span>{snap.unread>0&&<span className="wp-badge">{snap.unread}</span>}
 </button>
}
export function WatchPartyPanel(){
 const snap=useParty(),[open,setOpen]=useState(false),[name,setName]=useState(partyName),[code,setCode]=useState(''),[text,setText]=useState(''),[copied,setCopied]=useState(false),chatRef=useRef<HTMLDivElement>(null)
 useEffect(()=>{const f=()=>setOpen(true);window.addEventListener('nr-party-open',f);return()=>window.removeEventListener('nr-party-open',f)},[])
 useEffect(()=>{party.panelOpen=open;if(open)party.seen()},[open])
 useEffect(()=>{chatRef.current?.scrollTo({top:1e9})},[snap.chat.length,open])
 if(!open)return null
 const saveName=()=>{lsSet('partyName',name.trim().slice(0,30))}
 const ready=snap.status==='ready'
 return <aside className="wp-panel" role="dialog" aria-label={t('Watch together')}>
  <header><b>👥 {t('Watch together')}</b><button className="wp-x" aria-label={t('Minimize')} title={t('Minimize')} onClick={()=>setOpen(false)}>–</button></header>
  {!snap.role||snap.status==='error'?<div className="wp-body">
   <p className="wp-help">{t('Each person plays the video from their own sources (install the same source). Play, pause, position and episode are shared.')}</p>
   <label className="wp-field">{t('Your name')}<input value={name} maxLength={30} onChange={e=>setName(e.target.value)} onBlur={saveName} placeholder={t('e.g. Ali')}/></label>
   <button className="primary" disabled={snap.status==='connecting'} onClick={()=>{saveName();party.host()}}>{t('Start a watch party')}</button>
   <div className="wp-or">{t('or')}</div>
   <form className="wp-join" onSubmit={e=>{e.preventDefault();saveName();party.join(code)}}><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={7} placeholder={t('Code (6 letters)')} aria-label={t('Watch party code')}/><button type="submit" disabled={code.trim().length<6||snap.status==='connecting'}>{t('Join')}</button></form>
   {snap.status==='error'&&<p className="wp-error" role="alert">{snap.error}</p>}
  </div>:<div className="wp-body">
   {snap.status==='connecting'?<p className="wp-help"><span className="spinner"/> {snap.role==='host'?t('Creating the watch party…'):t('Joining…')}</p>:<>
    <div className="wp-code"><span>{t('Code')}</span><b>{snap.code}</b><button onClick={()=>{navigator.clipboard?.writeText(snap.code).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000)}}>{copied?'✓':t('Copy')}</button></div>
    <div className="wp-members">{plural(snap.members.length,'{n} person','{n} people')}: {snap.members.map(m=>m.name).join(', ')}</div>
    {snap.state?.media?<div className="wp-now">▶ {snap.state.media.name}{snap.state.episodeName&&snap.state.media.kind!=='movie'?' · '+snap.state.episodeName:''}</div>:<div className="wp-now muted">{t('Open an episode: everyone will follow.')}</div>}
    <div className="wp-chat" ref={chatRef}>{snap.chat.map((c,i)=><div key={i} className={'wp-msg'+(c.mine?' mine':'')+(c.system?' system':'')}>{c.system?c.text:<><b>{c.name}</b> {c.text}</>}</div>)}</div>
    <form className="wp-say" onSubmit={e=>{e.preventDefault();party.say(text);setText('')}}><input value={text} onChange={e=>setText(e.target.value)} placeholder={t('Message…')} aria-label={t('Message')}/><button type="submit" disabled={!text.trim()}>{t('Send')}</button></form>
   </>}
   <button className="removebtn wp-leave" onClick={()=>party.leave()}>{snap.role==='host'?t('End the watch party'):t('Leave')}</button>
  </div>}
 </aside>
}
