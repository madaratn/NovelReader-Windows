// Watch party: watch an anime, a series or a movie together on several PCs.
// Each PC plays the video from its own sources; NovelReader keeps the same
// episode, play / pause and position everywhere, with a small chat.
// Connection: the free public PeerJS server only introduces the PCs (6-letter
// code), then they talk directly (WebRTC). The host relays to every guest.
// Voice channel: each person in it calls the others directly (audio only).
import React,{useEffect,useRef,useState}from'react'
import{t,plural}from'../i18n'
import{lsGet,lsSet}from'../lib/util'

export type PartyMedia={kind:'anime'|'series'|'movie',sourceId:string,sourceName?:string,sourcePkg?:string,url:string,name:string,cover?:string,id?:string}
// What a PC needs to show the same episode; episodeNumber lets a PC without the source find it elsewhere.
export type PartyOpen={media:PartyMedia,episodeUrl:string,episodeName:string,episodeNumber?:number}
export type PartyState={media:PartyMedia|null,episodeUrl:string,episodeName:string,episodeNumber?:number,playing:boolean,time:number,rate:number,by:string}
type Member={id:string,name:string,voice?:boolean,muted?:boolean}
type Msg={t:'hello',name:string}|{t:'members',list:Member[]}|{t:'state',s:PartyState}|{t:'chat',name:string,text:string,at:number}|{t:'voice',on:boolean,muted:boolean}|{t:'buffer',on:boolean,time:number}|{t:'wait',list:{id:string,name:string}[]}|{t:'bye'}
type Conn={id:string,send:(m:Msg)=>void,onMessage:(cb:(m:Msg)=>void)=>void,onClose:(cb:()=>void)=>void,close:()=>void}
type Call={peer:string,answer:(s:MediaStream)=>void,onStream:(cb:(s:MediaStream)=>void)=>void,onClose:(cb:()=>void)=>void,close:()=>void}
type Transport={host:(code:string,onConn:(c:Conn)=>void)=>Promise<void>,join:(code:string)=>Promise<Conn>,destroy:()=>void,selfId:()=>string,call:(peer:string,s:MediaStream)=>Call,onCall:(cb:(c:Call)=>void)=>void}

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
  destroy:()=>{try{peer?.destroy()}catch{}peer=null},
  selfId:()=>String(peer?.id||''),
  call:(id,stream)=>wrapCall(peer.call(id,stream)),
  onCall:cb=>{peer.on('call',(mc:any)=>cb(wrapCall(mc)))}
 }
 function wrapCall(mc:any):Call{return{peer:String(mc.peer),answer:st=>mc.answer(st),onStream:cb=>mc.on('stream',cb),onClose:cb=>{mc.on('close',cb);mc.on('error',cb)},close:()=>{try{mc.close()}catch{}}}}
}
// Tests: two windows of the same browser talk through a BroadcastChannel.
function fakeTransport():Transport{
 let chans:BroadcastChannel[]=[]
 let me=Math.random().toString(36).slice(2,8)
 const sig=new BroadcastChannel('wp-voice');chans.push(sig)
 const pcs=new Map<string,RTCPeerConnection>();let onCallCb:(c:Call)=>void=()=>{}
 const mkCall=(peer:string,id:string,pc:RTCPeerConnection,incoming?:RTCSessionDescriptionInit):Call=>{let onS:(s:MediaStream)=>void=()=>{},onC:()=>void=()=>{};pc.ontrack=e=>onS(e.streams[0]);pc.onicecandidate=e=>{if(e.candidate)sig.postMessage({to:peer,from:me,id,ice:e.candidate.toJSON()})};pc.onconnectionstatechange=()=>{if(['closed','failed'].includes(pc.connectionState))onC()}
  return{peer,answer:async st=>{for(const tr of st.getTracks())pc.addTrack(tr,st);await pc.setRemoteDescription(incoming!);const a=await pc.createAnswer();await pc.setLocalDescription(a);sig.postMessage({to:peer,from:me,id,answer:a})},onStream:cb=>{onS=cb},onClose:cb=>{onC=cb},close:()=>{pc.close();sig.postMessage({to:peer,from:me,id,bye:1});onC()}}}
 sig.onmessage=async e=>{const d=e.data;if(d.to!==me)return;const pc=pcs.get(d.id)
  if(d.offer){const p2=new RTCPeerConnection();pcs.set(d.id,p2);onCallCb(mkCall(d.from,d.id,p2,d.offer))}
  else if(d.answer&&pc)await pc.setRemoteDescription(d.answer)
  else if(d.ice&&pc)await pc.addIceCandidate(d.ice).catch(()=>{})
  else if(d.bye&&pc){pc.close();pcs.delete(d.id)}}
 const pipe=(name:string,peerId:string):Conn=>{const ch=new BroadcastChannel(name);chans.push(ch);let onMsg:(m:Msg)=>void=()=>{},onClose:()=>void=()=>{};ch.onmessage=e=>{const d=e.data;if(d.from===me)return;if(d.bye)onClose();else onMsg(d.m)};return{id:peerId,send:m=>ch.postMessage({from:me,m}),onMessage:cb=>{onMsg=cb},onClose:cb=>{onClose=cb},close:()=>{ch.postMessage({from:me,bye:1});ch.close()}}}
 return{
  host:async(code,onConn)=>{me='host';const lobby=new BroadcastChannel('wp-'+code);chans.push(lobby);lobby.onmessage=e=>{if(e.data?.knock){const c=pipe('wp-'+code+'-'+e.data.knock,e.data.knock);lobby.postMessage({welcome:e.data.knock});onConn(c)}}},
  join:code=>new Promise((res,rej)=>{const lobby=new BroadcastChannel('wp-'+code);chans.push(lobby);const tm=setTimeout(()=>rej(new Error(t('No watch party with this code. Check the code with your friend.'))),1500);lobby.onmessage=e=>{if(e.data?.welcome===me){clearTimeout(tm);res(pipe('wp-'+code+'-'+me,'host'))}};lobby.postMessage({knock:me})}),
  destroy:()=>{for(const p of pcs.values())p.close();pcs.clear();for(const c of chans)try{c.close()}catch{}chans=[]},
  selfId:()=>me,
  call:(peer,stream)=>{const id=Math.random().toString(36).slice(2);const pc=new RTCPeerConnection();pcs.set(id,pc);const c=mkCall(peer,id,pc);for(const tr of stream.getTracks())pc.addTrack(tr,stream);pc.createOffer().then(async o=>{await pc.setLocalDescription(o);sig.postMessage({to:peer,from:me,id,offer:o})});return c},
  onCall:cb=>{onCallCb=cb}
 }
}

// ---- Party (one per window, survives page changes) -------------------------------
type Chat={name:string,text:string,at:number,mine?:boolean,system?:boolean}
type Snapshot={role:''|'host'|'guest',code:string,status:'idle'|'connecting'|'ready'|'error',error:string,members:Member[],chat:Chat[],unread:number,state:PartyState|null,stateAt:number,voice:'off'|'joining'|'on',muted:boolean,speaking:string[],voiceError:string,selfId:string,waiting:{id:string,name:string}[],missing:PartyMedia|null,missingState:''|'installing'|'error',missingError:string}
const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode=()=>Array.from({length:6},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('')
export const partyName=()=>lsGet('partyName')||''

class Party{
 snap:Snapshot={role:'',code:'',status:'idle',error:'',members:[],chat:[],unread:0,state:null,stateAt:0,voice:'off',muted:false,speaking:[],voiceError:'',selfId:'',waiting:[],missing:null,missingState:'',missingError:''}
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
  this.leave();this.myName=partyName()||t('Guest');this.set({role:'host',status:'connecting',error:'',members:[],chat:[]})
  for(let i=0;i<4;i++){const code=newCode();try{this.transport=await this.make();await this.transport.host(code,c=>this.accept(c));this.transport.onCall(c=>this.incoming(c));this.set({code,status:'ready',selfId:this.transport.selfId()});this.sendMembers();this.system(t('Watch party created. Share the code {code}.',{code}));return}catch(e:any){this.transport?.destroy();if(e?.message!=='taken'){this.set({status:'error',error:String(e?.message||e),role:''});return}}}
 }
 async join(code:string){
  const c=code.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length!==6){this.set({status:'error',error:t('The code has 6 letters or numbers.')});return}
  this.leave();this.myName=partyName()||t('Guest');this.set({role:'guest',code:c,status:'connecting',error:'',chat:[]})
  try{this.transport=await this.make();const conn=await this.transport.join(c);this.conns=[conn];conn.onMessage(m=>this.receive(m,conn));conn.onClose(()=>{if(this.snap.role==='guest')this.leave(t('The host closed the watch party.'))});this.transport.onCall(c=>this.incoming(c));conn.send({t:'hello',name:this.me()});this.set({status:'ready',selfId:this.transport.selfId()})}
  catch(e:any){this.transport?.destroy();this.transport=null;this.set({status:'error',error:String(e?.message||e),role:''})}
 }
 private accept(c:Conn){
  this.conns.push(c);c.onMessage(m=>this.receive(m,c))
  c.onClose(()=>{this.conns=this.conns.filter(x=>x!==c);const n=this.names.get(c.id);this.names.delete(c.id);this.voiceOf.delete(c.id);this.hangUp(c.id);this.noteBuffer(c.id,false,0);if(n)this.system(t('{name} left.',{name:n}));this.sendMembers()})
 }
 private voiceOf=new Map<string,{on:boolean,muted:boolean}>()
 private sendMembers(){const self=this.transport?.selfId()||'me',mine={on:this.snap.voice==='on',muted:this.snap.muted};const list:Member[]=[{id:self,name:this.me(),voice:mine.on,muted:mine.muted},...this.conns.map(c=>({id:c.id,name:this.names.get(c.id)||'…',voice:!!this.voiceOf.get(c.id)?.on,muted:!!this.voiceOf.get(c.id)?.muted}))];this.set({members:list});for(const c of this.conns)c.send({t:'members',list})}
 private receive(m:Msg,from:Conn){
  if(m.t==='hello'&&this.snap.role==='host'){this.names.set(from.id,String(m.name||t('Guest')).slice(0,30));this.system(t('{name} joined.',{name:this.names.get(from.id)!}));this.sendMembers();if(this.snap.state)from.send({t:'state',s:this.snap.state})}
  else if(m.t==='members'){this.set({members:m.list});this.syncCalls()}
  else if(m.t==='voice'&&this.snap.role==='host'){this.voiceOf.set(from.id,{on:!!m.on,muted:!!m.muted});if(!m.on)this.hangUp(from.id);this.sendMembers();this.syncCalls()}
  else if(m.t==='chat'){this.addChat({name:m.name,text:String(m.text).slice(0,500),at:m.at});if(this.snap.role==='host')this.relay(m,from)}
  else if(m.t==='buffer'&&this.snap.role==='host')this.noteBuffer(from.id,!!m.on,Number(m.time)||0)
  else if(m.t==='wait'&&this.snap.role==='guest')this.set({waiting:(m.list||[]).map(x=>({id:String(x.id),name:String(x.name)}))})
  else if(m.t==='state'){this.set({state:m.s,stateAt:Date.now()});this.onRemoteState?.(m.s);if(this.snap.role==='host')this.relay(m,from)}
 }
 private relay(m:Msg,from:Conn){for(const c of this.conns)if(c!==from)c.send(m)}
 private broadcast(m:Msg){for(const c of this.conns)c.send(m)}
 say(text:string){const x=text.trim().slice(0,500);if(!x||this.snap.status!=='ready')return;const m:Msg={t:'chat',name:this.me(),text:x,at:Date.now()};this.addChat({name:m.name,text:x,at:m.at,mine:true});this.broadcast(m)}
 share(s:Omit<PartyState,'by'>){if(this.snap.status!=='ready')return;const st={...s,by:this.me()};this.set({state:st,stateAt:Date.now()});this.broadcast({t:'state',s:st})}
 seen(){if(this.snap.unread)this.set({unread:0})}
 // ---- Waiting for people whose video is loading ----
 // Each PC says when its video is stuck loading; the host decides to pause the group
 // (WatchPartyBridge) and tells everyone who is being waited for.
 buffering=new Map<string,{name:string,time:number,since:number}>()
 onBufferChange:(()=>void)|null=null
 private noteBuffer(id:string,on:boolean,time:number){
  const had=this.buffering.has(id)
  if(on){const name=id===this.snap.selfId?this.me():this.names.get(id)||t('Guest');this.buffering.set(id,{name,time,since:this.buffering.get(id)?.since||Date.now()})}else this.buffering.delete(id)
  if(had!==on)this.onBufferChange?.()
 }
 reportBuffer(on:boolean,time:number){if(this.snap.status!=='ready')return;if(this.snap.role==='host')this.noteBuffer(this.snap.selfId,on,time);else this.broadcast({t:'buffer',on,time})}
 setWaiting(list:{id:string,name:string}[]){if(this.snap.role!=='host')return;const cur=this.snap.waiting;if(cur.length===list.length&&cur.every((x,i)=>x.id===list[i].id))return;this.set({waiting:list});this.broadcast({t:'wait',list})}
 note(text:string){this.system(text)}
 // This PC does not have the source of the episode being watched.
 setMissing(m:PartyMedia|null){if((m?.sourceId||'')===(this.snap.missing?.sourceId||'')&&!!m===!!this.snap.missing)return;this.set({missing:m,missingState:'',missingError:''})}
 async installMissing(){const m=this.snap.missing;if(!m||this.snap.missingState==='installing')return
  this.set({missingState:'installing',missingError:''})
  try{await installSourceOf(m);this.set({missing:null,missingState:''});this.system(t('{name} installed.',{name:m.sourceName||t('Source')}));window.dispatchEvent(new Event('nr-party-reopen'))}
  catch(e:any){this.set({missingState:'error',missingError:String(e?.message||e)})}}
 // ---- Voice channel ----
 private local:MediaStream|null=null
 private calls=new Map<string,{call:Call,audio?:HTMLAudioElement}>()
 private meter:any=null
 private voiceMsg(){if(this.snap.role==='host'){this.sendMembers();this.syncCalls()}else this.broadcast({t:'voice',on:this.snap.voice==='on',muted:this.snap.muted})}
 async voiceJoin(){
  if(this.snap.status!=='ready'||this.snap.voice!=='off')return
  this.set({voice:'joining',voiceError:''})
  try{this.local=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})}
  catch(e:any){this.set({voice:'off',voiceError:/NotAllowed|Permission/i.test(String(e?.name||e))?t('The microphone is not allowed. Check Windows Settings › Privacy › Microphone.'):/NotFound/i.test(String(e?.name||e))?t('No microphone found.'):String(e?.message||e)});return}
  this.set({voice:'on',muted:false});this.system(t('You joined the voice channel.'));this.voiceMsg();this.startMeter()
  // Newcomer calls everyone already in the channel; they answer.
  this.syncCalls(true)
 }
 private syncCalls(callOut=false){
  if(this.snap.voice!=='on'||!this.local||!this.transport)return
  const self=this.transport.selfId()
  for(const m of this.snap.members){if(m.id===self)continue
   if(m.voice&&!this.calls.has(m.id)&&callOut){this.track(this.transport.call(m.id,this.local))}
   if(!m.voice&&this.calls.has(m.id))this.hangUp(m.id)}
 }
 private incoming(c:Call){if(this.snap.voice!=='on'||!this.local){c.close();return}this.hangUp(c.peer);c.answer(this.local);this.track(c)}
 private track(c:Call){
  const entry:{call:Call,audio?:HTMLAudioElement}={call:c};this.calls.set(c.peer,entry)
  c.onStream(st=>{const a=entry.audio||document.createElement('audio');a.autoplay=true;a.dataset.wpVoice=c.peer;a.srcObject=st;a.volume=voiceVolume();if(!entry.audio){a.style.display='none';document.body.appendChild(a)}entry.audio=a;a.play().catch(()=>{});this.watch(c.peer,st)})
  c.onClose(()=>{if(this.calls.get(c.peer)===entry)this.hangUp(c.peer)})
 }
 private hangUp(id:string){const e=this.calls.get(id);if(!e)return;this.calls.delete(id);try{e.call.close()}catch{}e.audio?.remove();this.levels.delete(id)}
 setMuted(muted:boolean){if(!this.local)return;for(const tr of this.local.getAudioTracks())tr.enabled=!muted;this.set({muted});this.voiceMsg()}
 setVolume(v:number){lsSet('partyVoiceVolume',String(v));for(const e of this.calls.values())if(e.audio)e.audio.volume=v}
 voiceLeave(silent=false){for(const id of [...this.calls.keys()])this.hangUp(id);this.local?.getTracks().forEach(tr=>tr.stop());this.local=null;clearInterval(this.meter);this.meter=null;this.levels.clear();const was=this.snap.voice==='on';this.set({voice:'off',muted:false,speaking:[]});if(was&&!silent){this.system(t('You left the voice channel.'));this.voiceMsg()}}
 // Who is speaking: audio level of each voice (and mine), checked 6 times a second.
 private ctx:AudioContext|null=null
 private levels=new Map<string,AnalyserNode>()
 private watch(id:string,st:MediaStream){try{this.ctx=this.ctx||new AudioContext();const src=this.ctx.createMediaStreamSource(st),an=this.ctx.createAnalyser();an.fftSize=512;src.connect(an);this.levels.set(id,an)}catch{}}
 private startMeter(){if(this.local)this.watch(this.transport?.selfId()||'me',this.local);const buf=new Uint8Array(512);this.meter=setInterval(()=>{const on:string[]=[];for(const[id,an]of this.levels){an.getByteTimeDomainData(buf);let peak=0;for(const v of buf)peak=Math.max(peak,Math.abs(v-128));if(peak>12&&!(id===this.snap.selfId&&this.snap.muted))on.push(id)}const cur=this.snap.speaking;if(on.length!==cur.length||on.some(x=>!cur.includes(x)))this.set({speaking:on})},160)}
 leave(error=''){this.voiceLeave(true);for(const c of this.conns)c.close();this.conns=[];this.names.clear();this.transport?.destroy();this.transport=null;this.buffering.clear();this.set({role:'',status:error?'error':'idle',error,members:[],state:null,code:'',selfId:'',waiting:[],missing:null,missingState:'',missingError:''})}
}
// ---- Video sources of this PC (to tell if the party's source is installed) ------
const listOf=(d:any,...k:string[])=>Array.isArray(d)?d:(k.map(x=>d?.[x]).find(Array.isArray)||[])
let srcCache:{at:number,map:Map<string,{pkg:string,name:string}>}|null=null
export async function videoSources(force=false){
 if(!force&&srcCache&&Date.now()-srcCache.at<60000)return srcCache.map
 const d=await window.novelReader.miwayomiFetch('/api/v1/sources')
 const map=new Map<string,{pkg:string,name:string}>(listOf(d,'anime','sources','items').map((x:any)=>[String(x.id),{pkg:String(x.pkg||''),name:String(x.name||'')}]))
 srcCache={at:Date.now(),map};return map
}
export const knownSourcePkg=(id:string)=>srcCache?.map.get(id)?.pkg||''
// Install the extension of a source from the repositories enabled on this PC.
async function installSourceOf(m:PartyMedia){
 const nr:any=window.novelReader,clean=(n:any)=>String(n||'').replace(/^Aniyomi:\s*/i,'').toLowerCase()
 let repos:string[]=[];try{const r=JSON.parse(localStorage.getItem('animeRepos')||'null');if(Array.isArray(r))repos=r.filter((x:any)=>x&&x.enabled&&x.url).map((x:any)=>String(x.url))}catch{}
 if(!repos.length)repos=['https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json','https://raw.githubusercontent.com/msrofficial/anime-repo/repo/index.min.json']
 for(const repoUrl of repos){
  let list:any[]=[];try{list=listOf(await nr.miwayomiFetch('/api/v1/extensions/repo?url='+encodeURIComponent(repoUrl)),'extensions','plugins','items')}catch{continue}
  const hit=list.find((x:any)=>(m.sourcePkg&&x.pkg===m.sourcePkg)||(Array.isArray(x.sources)&&x.sources.some((s:any)=>String(s.id)===m.sourceId))||(m.sourceName&&clean(x.name)===clean(m.sourceName)))
  if(!hit?.apk)continue
  const r:any=await nr.miwayomiFetch('/api/v1/extensions/install','POST',{repoUrl,apk:hit.apk});if(r&&r.ok===false)throw new Error(r.error||t('Install failed'))
  const map=await videoSources(true);if(!map.has(m.sourceId))throw new Error(t('{name} was installed but its source did not appear. Restart NovelReader.',{name:m.sourceName||hit.name}))
  return
 }
 throw new Error(t('{name} is not in your source repositories. Add the same repository as your friend (Video sources).',{name:m.sourceName||t('This source')}))
}
export async function inviteText(code:string){const base=await (window.novelReader as any).inviteBase?.().catch(()=>'')||'';const link=base?base+code:'novelreader://party/'+code;return t('Join my NovelReader watch party: {link} (code {code})',{link,code})}
export const voiceVolume=()=>{const v=Number(lsGet('partyVoiceVolume'));return isFinite(v)&&lsGet('partyVoiceVolume')!==null?Math.min(1,Math.max(0,v)):1}
export const party=new Party()
export function useParty(){const[,bump]=useState(0);useEffect(()=>party.subscribe(()=>bump(x=>x+1)),[]);return party.snap}

// ---- Bridge: follows the player of this window ---------------------------------
// current(): what this window is playing; open(): show the same title/episode.
export function WatchPartyBridge({current,open}:{current:()=>PartyOpen|null,open:(o:PartyOpen)=>void}){
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
  party.onRemoteState=s=>{if(!s.media)return;seq.current++;if(sameEp(s)){const v=video();if(v&&v.readyState>=1&&apply(s))pending.current=null;else{pending.current=s;pendingAt.current=Date.now()}return}pending.current=s;pendingAt.current=Date.now();quietUntil.current=Date.now()+15000;lastEp.current=s.media.sourceId+'|'+s.media.url+'|'+s.episodeUrl;openRef.current({media:s.media,episodeUrl:s.episodeUrl,episodeName:s.episodeName,episodeNumber:s.episodeNumber})}
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
   // The player went back to the start by itself (stream reloaded, server switched after
   // a stall, HLS recovery): never send that to everyone. Put this player back on the
   // group's position instead. A restart chosen by hand (click, key) is still shared.
   const st=party.snap.state
   if(st&&sameEp(st)&&Date.now()-lastInput>1500){const groupT=st.time+(st.playing?(Date.now()-(party.snap.stateAt||Date.now()))/1000:0)
    if(groupT>10&&v.currentTime<Math.min(5,groupT-8)){if(!pending.current){pending.current=st;pendingAt.current=party.snap.stateAt||Date.now()}return}}
   party.share({media:c.media,episodeUrl:c.episodeUrl,episodeName:c.episodeName,episodeNumber:c.episodeNumber,playing:!v.paused,time:v.currentTime,rate:v.playbackRate})}
  const evs=['play','pause','seeked','ratechange']
  let attachAt=0,settled=0,lastInput=0;const onCanPlay=()=>{if(!settled)settled=Date.now()+250}
  // The player reloads its stream in the same <video> (quality or server change, stall
  // recovery): treat it like a new video, then put it back on the group's position.
  const onReload=()=>{if(!attached)return;attachAt=Date.now();settled=0;const st=party.snap.state;if(st&&sameEp(st)&&!pending.current){pending.current=st;pendingAt.current=party.snap.stateAt||Date.now()}}
  window.addEventListener('nr-player-reload',onReload)
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
  if(snap.role==='host')hb=setInterval(()=>{if(attached&&!attached.paused&&!attached.seeking&&attached.readyState>=3&&!pending.current&&Date.now()>=quietUntil.current)send()},5000)
  return()=>{clearInterval(iv);clearInterval(hb);attached?.removeEventListener('canplay',onCanPlay);window.removeEventListener('pointerdown',onInput,true);window.removeEventListener('keydown',onInput,true);window.removeEventListener('nr-user-input',onInput);window.removeEventListener('nr-player-reload',onReload);for(const e of evs)attached?.removeEventListener(e,send)}
 },[active,snap.role])
 useEffect(()=>{if(active)videoSources().catch(()=>{})},[active])
 useEffect(()=>{const f=()=>{const st=party.snap.state;if(!st?.media)return;pending.current=st;pendingAt.current=party.snap.stateAt||Date.now();quietUntil.current=Date.now()+15000;openRef.current({media:st.media,episodeUrl:st.episodeUrl,episodeName:st.episodeName,episodeNumber:st.episodeNumber})};window.addEventListener('nr-party-reopen',f);return()=>window.removeEventListener('nr-party-reopen',f)},[])
 // ---- Waiting for slow connections ----
 // Every PC: say when its video has been stuck loading for 1.5 s, and when it has
 // enough loaded again. The host: pause everyone at the slow person's position, and
 // start again together once nobody is loading (at most 30 s per person).
 const[slowHint,setSlowHint]=useState(false)
 useEffect(()=>{if(!active)return
  let since=0,reported=false;const mine:number[]=[]
  const ahead=(v:HTMLVideoElement)=>{const b=v.buffered;for(let i=0;i<b.length;i++)if(b.start(i)<=v.currentTime+0.2&&b.end(i)>=v.currentTime)return b.end(i)-v.currentTime;return 0}
  const iv=setInterval(()=>{const v=video(),st=party.snap.state,now=Date.now()
   const relevant=!!v&&!!st&&sameEp(st)&&!pending.current
   if(!reported){
    const stuck=relevant&&st!.playing&&!v!.paused&&!v!.ended&&(v!.readyState<3||v!.seeking)
    if(!stuck){since=0;return}
    if(!since)since=now
    if(now-since<1500)return
    reported=true;party.reportBuffer(true,v!.currentTime)
    mine.push(now);while(mine.length&&now-mine[0]>5*60000)mine.shift()
    if(mine.length>=3)setSlowHint(true)
   }else{
    const nearEnd=!!v&&Number.isFinite(v.duration)&&v.duration-v.currentTime<4
    if(!relevant||v!.ended||nearEnd||v!.readyState>=4||ahead(v!)>=4){reported=false;since=0;party.reportBuffer(false,0)}
   }
  },300)
  return()=>{clearInterval(iv);if(reported)party.reportBuffer(false,0)}
 },[active])
 useEffect(()=>{if(!slowHint)return;const tm=setTimeout(()=>setSlowHint(false),20000);return()=>clearTimeout(tm)},[slowHint])
 useEffect(()=>{if(!active||snap.role!=='host')return
  let hold:{time:number,since:number}|null=null;const skip=new Map<string,number>()
  const names=(w:[string,{name:string}][])=>w.map(([id,b])=>({id,name:b.name}))
  const shareLocal=(patch:Partial<PartyState>)=>{const st=party.snap.state;if(!st)return;party.share({media:st.media,episodeUrl:st.episodeUrl,episodeName:st.episodeName,episodeNumber:st.episodeNumber,playing:st.playing,time:st.time,rate:st.rate,...patch});const now=party.snap.state;if(now)apply(now)}
  const tick=()=>{const now=Date.now(),st=party.snap.state,v=video()
   const w=[...party.buffering.entries()].filter(([id])=>!((skip.get(id)||0)>now))
   if(lsGet('partyWait')==='0'){if(hold){hold=null;shareLocal({playing:true})}party.setWaiting([]);return}
   if(!hold){
    if(w.length&&st&&st.playing&&v&&sameEp(st)){const times=w.map(([,b])=>b.time).filter(x=>x>0);hold={time:Math.max(0,Math.min(v.currentTime,...times)),since:now};shareLocal({playing:false,time:hold.time});party.setWaiting(names(w))}
    else party.setWaiting([])
    return}
   if(!st||!sameEp(st)){hold=null;party.setWaiting([]);return}
   if(st.playing){hold=null;for(const[id]of w)skip.set(id,now+10000);party.setWaiting([]);return} // someone pressed play: go on
   if(!w.length){const at=hold.time;hold=null;party.setWaiting([]);shareLocal({playing:true,time:at});return}
   if(now-hold.since>30000){for(const[id]of w)skip.set(id,now+120000);party.note(t('{names} still loading: the party goes on without waiting.',{names:names(w).map(x=>x.name).join(', ')}));const at=hold.time;hold=null;party.setWaiting([]);shareLocal({playing:true,time:at});return}
   party.setWaiting(names(w))}
  party.onBufferChange=tick;const iv=setInterval(tick,500)
  return()=>{clearInterval(iv);party.onBufferChange=null;party.setWaiting([])}
 },[active,snap.role])
 if(!active)return null
 const meWaited=snap.waiting.some(x=>x.id===snap.selfId)
 if(!snap.waiting.length&&!slowHint)return null
 return <div className="wp-wait" role="status">{snap.waiting.length?<span>⏳ {meWaited&&snap.waiting.length===1?t('Your video is loading, the others are waiting for you…'):t('Waiting for {names}… (video loading)',{names:snap.waiting.map(x=>x.name).join(', ')})}</span>:null}{slowHint&&<span className="wp-wait-hint">{t('Your video keeps loading: choose a lower quality in the Quality menu, or another server.')}</span>}</div>
}

// ---- Panel ------------------------------------------------------------------------
export function WatchPartyButton(){
 const snap=useParty()
 return <button className={'nav-item subtle wp-open'+(snap.status==='ready'?' live':'')} onClick={()=>{party.panelOpen=true;party.seen();window.dispatchEvent(new Event('nr-party-open'))}} title={t('Watch together')}>
  <span className="wp-icon" aria-hidden="true">👥</span><span className="label">{snap.status==='ready'?t('Watch party · {code}',{code:snap.code}):t('Watch together')}</span>{snap.unread>0&&<span className="wp-badge">{snap.unread}</span>}
 </button>
}
export function WatchPartyPanel(){
 const snap=useParty(),[open,setOpen]=useState(false),[name,setName]=useState(partyName),[code,setCode]=useState(''),[text,setText]=useState(''),[copied,setCopied]=useState(false),[invited,setInvited]=useState(false),chatRef=useRef<HTMLDivElement>(null)
 // Invitation links (novelreader://party/CODE): open the panel and join.
 useEffect(()=>{const nr:any=window.novelReader;const handle=(url:string)=>{const m=/^novelreader:\/\/party\/([A-Z0-9]{6})/i.exec(String(url||''));if(!m)return;const c=m[1].toUpperCase();setCode(c);setOpen(true);if(party.snap.status==='ready'&&party.snap.code===c)return;if(partyName())party.join(c);else setTimeout(()=>(document.querySelector('.wp-field input') as HTMLInputElement|null)?.focus(),50)};nr?.takeDeepLink?.().then(handle).catch(()=>{});return nr?.onDeepLink?.(handle)},[])
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
    <button className="wp-invite" onClick={async()=>{const text=await inviteText(snap.code);navigator.clipboard?.writeText(text).catch(()=>{});(window as any).__lastInvite=text;setInvited(true);setTimeout(()=>setInvited(false),3000)}}>{invited?'✓ '+t('Invitation copied: paste it in Discord, WhatsApp…'):'🔗 '+t('Copy an invitation link')}</button>
    <div className="wp-members" aria-label={plural(snap.members.length,'{n} person','{n} people')}>{snap.members.map(m=><span key={m.id} className={'wp-member'+(m.voice?' in-voice':'')+(snap.speaking.includes(m.id)?' speaking':'')} title={m.voice?(m.muted?t('In the voice channel (muted)'):t('In the voice channel')):''}>{m.voice?(m.muted?'🔇 ':'🎙 '):''}{m.name}{m.id===snap.selfId?' ('+t('you')+')':''}</span>)}</div>
    <div className="wp-voice">{snap.voice==='off'?<button onClick={()=>party.voiceJoin()}>{'🎙 '+t('Join the voice channel')}</button>:snap.voice==='joining'?<span className="wp-help">{t('Allowing the microphone…')}</span>:<><button className={snap.muted?'danger':''} aria-pressed={snap.muted} onClick={()=>party.setMuted(!snap.muted)}>{snap.muted?'🔇 '+t('Unmute'):'🎙 '+t('Mute')}</button><label className="wp-vol" title={t('Volume of the voices')}>🔊<input type="range" min={0} max={1} step={0.05} defaultValue={voiceVolume()} onChange={e=>party.setVolume(Number(e.target.value))} aria-label={t('Volume of the voices')}/></label><button className="removebtn" onClick={()=>party.voiceLeave()}>{t('Leave the voice channel')}</button></>}</div>
    {snap.voiceError&&<p className="wp-error" role="alert">{snap.voiceError}</p>}
    {snap.voice==='on'&&<p className="wp-hint">{t('Tip: use headphones so the film does not come back through your microphone.')}</p>}
    {snap.missing&&<div className="wp-missing" role="status"><p>{t('You do not have the source "{name}". NovelReader looks for the same episode in your other sources.',{name:snap.missing.sourceName||'?'})}</p><button className="primary" disabled={snap.missingState==='installing'} onClick={()=>party.installMissing()}>{snap.missingState==='installing'?t('Installing…'):t('Install {name}',{name:snap.missing.sourceName||t('the source')})}</button>{snap.missingError&&<p className="wp-error">{snap.missingError}</p>}</div>}
    {snap.role==='host'&&<label className="wp-check"><input type="checkbox" defaultChecked={lsGet('partyWait')!=='0'} onChange={e=>lsSet('partyWait',e.target.checked?'1':'0')}/> {t('Wait for people whose video is loading')}</label>}
    {snap.state?.media?<div className="wp-now">▶ {snap.state.media.name}{snap.state.episodeName&&snap.state.media.kind!=='movie'?' · '+snap.state.episodeName:''}</div>:<div className="wp-now muted">{t('Open an episode: everyone will follow.')}</div>}
    <div className="wp-chat" ref={chatRef}>{snap.chat.map((c,i)=><div key={i} className={'wp-msg'+(c.mine?' mine':'')+(c.system?' system':'')}>{c.system?c.text:<><b>{c.name}</b> {c.text}</>}</div>)}</div>
    <form className="wp-say" onSubmit={e=>{e.preventDefault();party.say(text);setText('')}}><input value={text} onChange={e=>setText(e.target.value)} placeholder={t('Message…')} aria-label={t('Message')}/><button type="submit" disabled={!text.trim()}>{t('Send')}</button></form>
   </>}
   <button className="removebtn wp-leave" onClick={()=>party.leave()}>{snap.role==='host'?t('End the watch party'):t('Leave')}</button>
  </div>}
 </aside>
}
