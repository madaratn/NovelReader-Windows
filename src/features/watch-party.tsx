// Watch party: watch an anime, a series or a movie together on several PCs.
// Each PC plays the video from its own sources; NovelReader keeps the same
// episode, play / pause and position everywhere, with a small chat.
// Connection: the free public PeerJS server only introduces the PCs (6-letter
// code), then they talk directly (WebRTC). The host relays to every guest.
// Voice channel: each person in it calls the others directly (audio only).
import React,{useEffect,useRef,useState}from'react'
import{createPortal}from'react-dom'
import{t,plural}from'../i18n'
import{lsGet,lsSet}from'../lib/util'

export type PartyMedia={kind:'anime'|'series'|'movie',sourceId:string,sourceName?:string,sourcePkg?:string,url:string,name:string,cover?:string,id?:string}
// What a PC needs to show the same episode; episodeNumber lets a PC without the source find it elsewhere.
export type PartyOpen={media:PartyMedia,episodeUrl:string,episodeName:string,episodeNumber?:number}
export type PartyState={media:PartyMedia|null,episodeUrl:string,episodeName:string,episodeNumber?:number,playing:boolean,time:number,rate:number,by:string}
type Member={id:string,name:string,voice?:boolean,muted?:boolean,cam?:boolean}
type Msg={t:'hello',name:string}|{t:'members',list:Member[]}|{t:'state',s:PartyState}|{t:'chat',name:string,text:string,at:number}|{t:'voice',on:boolean,muted:boolean,cam?:boolean}|{t:'buffer',on:boolean,time:number}|{t:'react',emoji:string,name:string}|{t:'wait',list:{id:string,name:string}[]}|{t:'bye',end?:boolean,next?:string}|{t:'ping'}
type Conn={id:string,send:(m:Msg)=>void,onMessage:(cb:(m:Msg)=>void)=>void,onClose:(cb:()=>void)=>void,close:()=>void}
type Call={peer:string,kind:'voice'|'cam',limit:(bps:number)=>void,answer:(s:MediaStream)=>void,onStream:(cb:(s:MediaStream)=>void)=>void,onClose:(cb:()=>void)=>void,close:()=>void}
type Transport={host:(code:string,onConn:(c:Conn)=>void)=>Promise<void>,join:(code:string)=>Promise<Conn>,destroy:()=>void,selfId:()=>string,call:(peer:string,s:MediaStream,kind?:'voice'|'cam')=>Call,onCall:(cb:(c:Call)=>void)=>void}

// ---- Transports ------------------------------------------------------------------
// Camera bubbles stay light so the film keeps the bandwidth.
function capBitrate(pc:()=>RTCPeerConnection|undefined,bps:number){let n=0;const go=()=>{const p=pc();const ss=p?.getSenders().filter(x=>x.track?.kind==='video')||[];if(!ss.length){if(++n<20)setTimeout(go,500);return}for(const sd of ss){try{const prm=sd.getParameters();if(!prm.encodings||!prm.encodings.length)prm.encodings=[{}];prm.encodings[0].maxBitrate=bps;(prm as any).degradationPreference='maintain-framerate';sd.setParameters(prm).catch(()=>{})}catch{}}};go()}
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
  call:(id,stream,kind='voice')=>wrapCall(peer.call(id,stream,{metadata:{kind}})),
  onCall:cb=>{peer.on('call',(mc:any)=>cb(wrapCall(mc)))}
 }
 function wrapCall(mc:any):Call{return{peer:String(mc.peer),kind:mc.metadata?.kind==='cam'?'cam':'voice',limit:bps=>capBitrate(()=>mc.peerConnection,bps),answer:st=>mc.answer(st&&st.getTracks().length?st:undefined),onStream:cb=>mc.on('stream',cb),onClose:cb=>{mc.on('close',cb);mc.on('error',cb)},close:()=>{try{mc.close()}catch{}}}}
}
// Tests: two windows of the same browser talk through a BroadcastChannel.
function fakeTransport():Transport{
 let chans:BroadcastChannel[]=[]
 let me=Math.random().toString(36).slice(2,8)
 const sig=new BroadcastChannel('wp-voice');chans.push(sig)
 const pcs=new Map<string,RTCPeerConnection>();let onCallCb:(c:Call)=>void=()=>{}
 const mkCall=(peer:string,id:string,pc:RTCPeerConnection,incoming?:RTCSessionDescriptionInit,kind:'voice'|'cam'='voice'):Call=>{let onS:(s:MediaStream)=>void=()=>{},onC:()=>void=()=>{};pc.ontrack=e=>onS(e.streams[0]);pc.onicecandidate=e=>{if(e.candidate)sig.postMessage({to:peer,from:me,id,ice:e.candidate.toJSON()})};pc.onconnectionstatechange=()=>{if(['closed','failed'].includes(pc.connectionState))onC()}
  return{peer,kind,limit:bps=>capBitrate(()=>pc,bps),answer:async st=>{for(const tr of st.getTracks())pc.addTrack(tr,st);await pc.setRemoteDescription(incoming!);const a=await pc.createAnswer();await pc.setLocalDescription(a);sig.postMessage({to:peer,from:me,id,answer:a})},onStream:cb=>{onS=cb},onClose:cb=>{onC=cb},close:()=>{pc.close();sig.postMessage({to:peer,from:me,id,bye:1});onC()}}}
 sig.onmessage=async e=>{const d=e.data;if(d.to!==me)return;const pc=pcs.get(d.id)
  if(d.offer){const p2=new RTCPeerConnection();pcs.set(d.id,p2);onCallCb(mkCall(d.from,d.id,p2,d.offer,d.kind==='cam'?'cam':'voice'))}
  else if(d.answer&&pc)await pc.setRemoteDescription(d.answer)
  else if(d.ice&&pc)await pc.addIceCandidate(d.ice).catch(()=>{})
  else if(d.bye&&pc){pc.close();pcs.delete(d.id)}}
 const pipe=(name:string,peerId:string):Conn=>{const ch=new BroadcastChannel(name);chans.push(ch);let onMsg:(m:Msg)=>void=()=>{},onClose:()=>void=()=>{};ch.onmessage=e=>{const d=e.data;if(d.from===me)return;if(d.bye)onClose();else onMsg(d.m)};return{id:peerId,send:m=>ch.postMessage({from:me,m}),onMessage:cb=>{onMsg=cb},onClose:cb=>{onClose=cb},close:()=>{ch.postMessage({from:me,bye:1});ch.close()}}}
 return{
  host:async(code,onConn)=>{me='host';const lobby=new BroadcastChannel('wp-'+code);chans.push(lobby);lobby.onmessage=e=>{if(e.data?.knock){const c=pipe('wp-'+code+'-'+e.data.knock,e.data.knock);lobby.postMessage({welcome:e.data.knock});onConn(c)}}},
  join:code=>new Promise((res,rej)=>{const lobby=new BroadcastChannel('wp-'+code);chans.push(lobby);const tm=setTimeout(()=>rej(new Error(t('No watch party with this code. Check the code with your friend.'))),1500);lobby.onmessage=e=>{if(e.data?.welcome===me){clearTimeout(tm);res(pipe('wp-'+code+'-'+me,'host'))}};lobby.postMessage({knock:me})}),
  destroy:()=>{for(const p of pcs.values())p.close();pcs.clear();for(const c of chans)try{c.close()}catch{}chans=[]},
  selfId:()=>me,
  call:(peer,stream,kind='voice')=>{const id=Math.random().toString(36).slice(2);const pc=new RTCPeerConnection();pcs.set(id,pc);const c=mkCall(peer,id,pc,undefined,kind);for(const tr of stream.getTracks())pc.addTrack(tr,stream);pc.createOffer().then(async o=>{await pc.setLocalDescription(o);sig.postMessage({to:peer,from:me,id,offer:o,kind})});return c},
  onCall:cb=>{onCallCb=cb}
 }
}

// ---- Party (one per window, survives page changes) -------------------------------
type Chat={name:string,text:string,at:number,mine?:boolean,system?:boolean}
type Snapshot={role:''|'host'|'guest',code:string,status:'idle'|'connecting'|'ready'|'error',error:string,members:Member[],chat:Chat[],unread:number,state:PartyState|null,stateAt:number,voice:'off'|'joining'|'on',muted:boolean,speaking:string[],voiceError:string,selfId:string,waiting:{id:string,name:string}[],missing:PartyMedia|null,missingState:''|'installing'|'error',missingError:string,reconnecting:boolean,ptt:boolean,talking:boolean,cam:'off'|'starting'|'on',camError:string,camLocal:MediaStream|null,cams:{id:string,stream:MediaStream}[]}
export const REACTIONS=['😂','❤️','😮','😱','🔥','👏','😢']
const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode=()=>Array.from({length:6},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('')
export const partyName=()=>lsGet('partyName')||''

class Party{
 snap:Snapshot={role:'',code:'',status:'idle',error:'',members:[],chat:[],unread:0,state:null,stateAt:0,voice:'off',muted:false,speaking:[],voiceError:'',selfId:'',waiting:[],missing:null,missingState:'',missingError:'',reconnecting:false,ptt:lsGet('partyPtt')==='1',talking:false,cam:'off',camError:'',camLocal:null,cams:[]}
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
  for(let i=0;i<4;i++){const code=newCode();try{this.transport=await this.make();await this.transport.host(code,c=>this.accept(c));this.transport.onCall(c=>this.route(c));this.set({code,status:'ready',selfId:this.transport.selfId()});this.sendMembers();this.keepAlive();this.system(t('Watch party created. Share the code {code}.',{code}));return}catch(e:any){this.transport?.destroy();if(e?.message!=='taken'){this.set({status:'error',error:String(e?.message||e),role:''});return}}}
 }
 async join(code:string){
  const c=code.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length!==6){this.set({status:'error',error:t('The code has 6 letters or numbers.')});return}
  this.leave();this.myName=partyName()||t('Guest');this.set({role:'guest',code:c,status:'connecting',error:'',chat:[]})
  try{await this.connectGuest(c)}
  catch(e:any){this.transport?.destroy();this.transport=null;this.set({status:'error',error:String(e?.message||e),role:''})}
 }
 private async connectGuest(code:string){
  this.transport=await this.make();const conn=await this.transport.join(code);this.conns=[conn];this.seen_.set(conn,Date.now())
  conn.onMessage(m=>{this.seen_.set(conn,Date.now());this.receive(m,conn)})
  conn.onClose(()=>{if(this.snap.role==='guest'&&this.conns.includes(conn))this.lost()})
  this.transport.onCall(c=>this.route(c));conn.send({t:'hello',name:this.me()});this.set({status:'ready',selfId:this.transport.selfId(),reconnecting:false});this.keepAlive()
 }
 // ---- Staying connected ----
 // Every PC sends a small "ping" every 3 s. A guest that hears nothing from the host
 // for 10 s reconnects; if the host is gone for good, the first guest becomes the
 // host under the same code and the others join it. The host drops a silent guest
 // after 15 s.
 private seen_=new Map<Conn,number>()
 private alive:any=null
 private recovering=false
 private keepAlive(){clearInterval(this.alive);this.alive=setInterval(()=>{const now=Date.now()
  for(const c of this.conns)c.send({t:'ping'})
  if(this.snap.role==='guest'){const c=this.conns[0];if(c&&now-(this.seen_.get(c)||now)>10000)this.lost()}
  else if(this.snap.role==='host')for(const c of [...this.conns])if(now-(this.seen_.get(c)||now)>15000){c.close();this.dropGuest(c)}},3000)}
 private dropGuest(c:Conn){if(!this.conns.includes(c))return;this.conns=this.conns.filter(x=>x!==c);this.seen_.delete(c);const n=this.names.get(c.id);this.names.delete(c.id);this.voiceOf.delete(c.id);this.hangUp(c.id);this.noteBuffer(c.id,false,0);if(n)this.system(t('{name} left.',{name:n}));this.sendMembers()}
 private closeLinks(){clearInterval(this.alive);this.alive=null;this.voiceLeave(true);this.camStop(true);for(const c of this.camIn.values()){try{c.close()}catch{}}this.camIn.clear();this.set({cams:[]});for(const c of this.conns)c.close();this.conns=[];this.seen_.clear();this.names.clear();this.voiceOf.clear();this.buffering.clear();this.transport?.destroy();this.transport=null}
 private lost(next?:string){
  if(this.recovering||!this.snap.role)return
  const code=this.snap.code,self=this.snap.selfId,members=this.snap.members,hostId=members[0]?.id
  const successor=next||members.find(m=>m.id!==hostId)?.id||''
  this.recovering=true;this.closeLinks()
  this.set({status:'connecting',reconnecting:true,waiting:[]})
  if(!next)this.system(t('Connection to the watch party lost. Reconnecting…'))
  ;(async()=>{const until=Date.now()+60000;let joinFails=0
   if(next&&successor!==self)await new Promise(r=>setTimeout(r,1200))
   while(this.recovering&&Date.now()<until){
    // The successor takes over the code once the old host has been gone a few seconds.
    if(successor===self&&(next||joinFails>=2)){try{this.transport=await this.make();await this.transport.host(code,c=>this.accept(c));this.transport.onCall(c=>this.route(c));this.set({role:'host',status:'ready',reconnecting:false,selfId:this.transport.selfId()});this.sendMembers();this.keepAlive();this.system(t('You are now the host of the watch party.'));this.recovering=false;return}catch{this.transport?.destroy();this.transport=null}}
    else{try{this.set({role:'guest'});await this.connectGuest(code);this.recovering=false;this.system(t('Reconnected.'));return}catch{this.transport?.destroy();this.transport=null;joinFails++}}
    await new Promise(r=>setTimeout(r,2000))}
   if(this.recovering){this.recovering=false;this.leave(t('Could not reconnect to the watch party.'))}})()
 }
 // The host leaves but the party goes on: the first guest becomes the host.
 private handingOver=false
 handOver(){if(this.snap.role!=='host'||!this.conns.length)return this.leave();const next=this.conns[0].id;this.handingOver=true;for(const c of this.conns)c.send({t:'bye',next});setTimeout(()=>{this.leave('',true);this.handingOver=false},200)}
 private accept(c:Conn){
  if(this.handingOver){c.close();return}
  this.conns.push(c);this.seen_.set(c,Date.now());c.onMessage(m=>{this.seen_.set(c,Date.now());this.receive(m,c)})
  c.onClose(()=>this.dropGuest(c))
 }
 private voiceOf=new Map<string,{on:boolean,muted:boolean,cam?:boolean}>()
 private sendMembers(){const self=this.transport?.selfId()||'me',mine={on:this.snap.voice==='on',muted:this.snap.muted};const list:Member[]=[{id:self,name:this.me(),voice:mine.on,muted:mine.muted,cam:this.snap.cam==='on'},...this.conns.map(c=>({id:c.id,name:this.names.get(c.id)||'…',voice:!!this.voiceOf.get(c.id)?.on,muted:!!this.voiceOf.get(c.id)?.muted,cam:!!this.voiceOf.get(c.id)?.cam}))];this.set({members:list});for(const c of this.conns)c.send({t:'members',list});this.syncCams()}
 private receive(m:Msg,from:Conn){
  if(m.t==='hello'&&this.snap.role==='host'){this.names.set(from.id,String(m.name||t('Guest')).slice(0,30));this.system(t('{name} joined.',{name:this.names.get(from.id)!}));this.sendMembers();if(this.snap.state)from.send({t:'state',s:this.snap.state})}
  else if(m.t==='bye'&&this.snap.role==='guest'){if(m.next){const host=this.snap.members[0]?.name||'';const nn=this.snap.members.find(x=>x.id===m.next)?.name||'';this.system(t('{host} left; {name} is now the host.',{host,name:nn}));this.lost(String(m.next))}else this.leave(t('The host closed the watch party.'))}
  else if(m.t==='members'){this.set({members:m.list});this.syncCalls();this.syncCams()}
  else if(m.t==='voice'&&this.snap.role==='host'){this.voiceOf.set(from.id,{on:!!m.on,muted:!!m.muted,cam:!!m.cam});if(!m.on)this.hangUp(from.id);this.sendMembers();this.syncCalls()}
  else if(m.t==='chat'){this.addChat({name:m.name,text:String(m.text).slice(0,500),at:m.at});if(this.snap.role==='host')this.relay(m,from)}
  else if(m.t==='react'){if(REACTIONS.includes(m.emoji)){this.emitReact(m.emoji,String(m.name||'').slice(0,30));if(this.snap.role==='host')this.relay(m,from)}}
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
 // Emoji reactions (shown flying over the video on every PC).
 private reactSubs=new Set<(r:{emoji:string,name:string,mine:boolean})=>void>()
 private lastReacts:number[]=[]
 onReact(f:(r:{emoji:string,name:string,mine:boolean})=>void){this.reactSubs.add(f);return()=>{this.reactSubs.delete(f)}}
 private emitReact(emoji:string,name:string,mine=false){for(const f of this.reactSubs)f({emoji,name,mine})}
 react(emoji:string){if(this.snap.status!=='ready'||!REACTIONS.includes(emoji))return;const now=Date.now();this.lastReacts=this.lastReacts.filter(x=>now-x<2000);if(this.lastReacts.length>=6)return;this.lastReacts.push(now);this.emitReact(emoji,this.me(),true);this.broadcast({t:'react',emoji,name:this.me()})}
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
 private voiceMsg(){if(this.snap.role==='host'){this.sendMembers();this.syncCalls()}else this.broadcast({t:'voice',on:this.snap.voice==='on',muted:this.snap.muted,cam:this.snap.cam==='on'})}
 async voiceJoin(){
  if(this.snap.status!=='ready'||this.snap.voice!=='off')return
  this.set({voice:'joining',voiceError:''})
  try{this.local=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})}
  catch(e:any){this.set({voice:'off',voiceError:/NotAllowed|Permission/i.test(String(e?.name||e))?t('The microphone is not allowed. Check Windows Settings › Privacy › Microphone.'):/NotFound/i.test(String(e?.name||e))?t('No microphone found.'):String(e?.message||e)});return}
  this.set({voice:'on',muted:false,talking:false});this.applyMic();this.system(t('You joined the voice channel.'));this.voiceMsg();this.startMeter()
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
 private applyMic(){if(!this.local)return;const on=!this.snap.muted&&(!this.snap.ptt||this.snap.talking);for(const tr of this.local.getAudioTracks())tr.enabled=on}
 setMuted(muted:boolean){if(!this.local)return;this.set({muted});this.applyMic();this.voiceMsg()}
 // Push to talk: the microphone is on only while the V key is held.
 setPtt(on:boolean){lsSet('partyPtt',on?'1':'0');this.set({ptt:on,talking:false});this.applyMic()}
 setTalking(on:boolean){if(!this.snap.ptt||this.snap.talking===on)return;this.set({talking:on});this.applyMic()}
 setVolume(v:number){lsSet('partyVoiceVolume',String(v));for(const e of this.calls.values())if(e.audio)e.audio.volume=v}
 voiceLeave(silent=false){for(const id of [...this.calls.keys()])this.hangUp(id);this.local?.getTracks().forEach(tr=>tr.stop());this.local=null;clearInterval(this.meter);this.meter=null;this.levels.clear();const was=this.snap.voice==='on';this.set({voice:'off',muted:false,speaking:[]});if(was&&!silent){this.system(t('You left the voice channel.'));this.voiceMsg()}}
 // ---- Cameras (small bubbles over the video) ----
 // Off by default. Whoever turns their camera on sends it to every other person
 // (video only, small and capped); the others only receive.
 private camOut=new Map<string,Call>()
 private camIn=new Map<string,Call>()
 private route(c:Call){if(c.kind==='cam')this.camIncoming(c);else this.incoming(c)}
 async camStart(){
  if(this.snap.status!=='ready'||this.snap.cam!=='off')return
  this.set({cam:'starting',camError:''})
  let st:MediaStream
  try{st=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:320},height:{ideal:240},frameRate:{ideal:15,max:15}},audio:false})}
  catch(e:any){const n=String(e?.name||e);this.set({cam:'off',camError:/NotAllowed|Permission/i.test(n)?t('The camera is not allowed. Check Windows Settings › Privacy › Camera.'):/NotFound|Overconstrained/i.test(n)?t('No camera found.'):/NotReadable|TrackStart/i.test(n)?t('The camera is used by another app.'):String(e?.message||e)});return}
  this.set({cam:'on',camLocal:st});this.voiceMsg();this.syncCams()
 }
 camStop(silent=false){for(const c of this.camOut.values()){try{c.close()}catch{}}this.camOut.clear();this.snap.camLocal?.getTracks().forEach(tr=>tr.stop());const was=this.snap.cam==='on';this.set({cam:'off',camLocal:null});if(was&&!silent)this.voiceMsg()}
 private syncCams(){
  const self=this.snap.selfId;if(!this.transport)return
  const ids=new Set(this.snap.members.filter(m=>m.id!==self).map(m=>m.id))
  // Mine to everyone (newcomers included).
  if(this.snap.cam==='on'&&this.snap.camLocal){for(const id of ids)if(!this.camOut.has(id)){const c=this.transport.call(id,this.snap.camLocal,'cam');this.camOut.set(id,c);c.limit(250000);c.onClose(()=>{if(this.camOut.get(id)===c)this.camOut.delete(id)})}}
  for(const[id,c]of[...this.camOut])if(!ids.has(id)){try{c.close()}catch{}this.camOut.delete(id)}
  // Theirs: dropped when they turn it off or leave.
  const on=new Set(this.snap.members.filter(m=>m.cam).map(m=>m.id))
  for(const[id,c]of[...this.camIn])if(!on.has(id)){try{c.close()}catch{}this.dropCam(id)}
 }
 private camIncoming(c:Call){const old=this.camIn.get(c.peer);if(old){try{old.close()}catch{}}this.camIn.set(c.peer,c);c.answer(new MediaStream());c.onStream(st=>this.set({cams:[...this.snap.cams.filter(x=>x.id!==c.peer),{id:c.peer,stream:st}]}));c.onClose(()=>{if(this.camIn.get(c.peer)===c)this.dropCam(c.peer)})}
 private dropCam(id:string){this.camIn.delete(id);if(this.snap.cams.some(x=>x.id===id))this.set({cams:this.snap.cams.filter(x=>x.id!==id)})}
 // Who is speaking: audio level of each voice (and mine), checked 6 times a second.
 private ctx:AudioContext|null=null
 private levels=new Map<string,AnalyserNode>()
 private watch(id:string,st:MediaStream){try{this.ctx=this.ctx||new AudioContext();const src=this.ctx.createMediaStreamSource(st),an=this.ctx.createAnalyser();an.fftSize=512;src.connect(an);this.levels.set(id,an)}catch{}}
 private startMeter(){if(this.local)this.watch(this.transport?.selfId()||'me',this.local);const buf=new Uint8Array(512);this.meter=setInterval(()=>{const on:string[]=[];for(const[id,an]of this.levels){an.getByteTimeDomainData(buf);let peak=0;for(const v of buf)peak=Math.max(peak,Math.abs(v-128));if(peak>12&&!(id===this.snap.selfId&&(this.snap.muted||(this.snap.ptt&&!this.snap.talking))))on.push(id)}const cur=this.snap.speaking;if(on.length!==cur.length||on.some(x=>!cur.includes(x)))this.set({speaking:on})},160)}
 leave(error='',quiet=false){this.recovering=false;if(this.snap.role==='host'&&!error&&!quiet)for(const c of this.conns)c.send({t:'bye',end:true});this.closeLinks();this.set({role:'',status:error?'error':'idle',error,members:[],state:null,code:'',selfId:'',waiting:[],missing:null,missingState:'',missingError:'',reconnecting:false})}
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
if((window as any).__partyFake)(window as any).__nrParty=party // tests only
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
 // The film gets quieter while someone else speaks in the voice channel.
 const others=snap.voice==='on'&&snap.speaking.some(id=>id!==snap.selfId)
 useEffect(()=>{if(snap.voice!=='on'||lsGet('partyDuck')==='0')return
  const v=video();if(!v)return
  if(others){if(!v.dataset.ducked){v.dataset.ducked=String(v.volume);v.volume=v.volume*0.35};return}
  const tm=setTimeout(()=>{const vv=video();if(vv?.dataset.ducked){const back=Number(vv.dataset.ducked);vv.volume=Math.min(1,Math.max(0,isFinite(back)?back:1));delete vv.dataset.ducked}},700)
  return()=>clearTimeout(tm)},[others,snap.voice])
 useEffect(()=>{if(snap.voice==='on')return;const v=video();if(v?.dataset.ducked){v.volume=Number(v.dataset.ducked)||1;delete v.dataset.ducked}},[snap.voice])
 // Push to talk: hold V.
 useEffect(()=>{if(snap.voice!=='on'||!snap.ptt)return
  const typing=(e:KeyboardEvent)=>{const el=e.target as HTMLElement;return!!el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.isContentEditable)}
  const down=(e:KeyboardEvent)=>{if((e.key==='v'||e.key==='V')&&!typing(e)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();party.setTalking(true)}}
  const up=(e:KeyboardEvent)=>{if(e.key==='v'||e.key==='V')party.setTalking(false)}
  const blur=()=>party.setTalking(false)
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur)
  return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);party.setTalking(false)}},[snap.voice,snap.ptt])
 useEffect(()=>{const f=()=>{const st=party.snap.state;if(!st?.media)return;pending.current=st;pendingAt.current=party.snap.stateAt||Date.now();quietUntil.current=Date.now()+15000;openRef.current({media:st.media,episodeUrl:st.episodeUrl,episodeName:st.episodeName,episodeNumber:st.episodeNumber})};window.addEventListener('nr-party-reopen',f);return()=>window.removeEventListener('nr-party-reopen',f)},[])
 // ---- Waiting for slow connections ----
 // Every PC: say when its video has been stuck loading for 1.5 s, and when it has
 // enough loaded again. The host: pause everyone at the slow person's position, and
 // start again together once nobody is loading (at most 30 s per person).
 const[slowHint,setSlowHint]=useState(false)
 useEffect(()=>{if(!active)return
  let since=0,reported=false,lastSeek=0;const mine:number[]=[]
  const onSeek=()=>{lastSeek=Date.now();since=0}
  document.addEventListener('seeking',onSeek,true)
  const ahead=(v:HTMLVideoElement)=>{const b=v.buffered;for(let i=0;i<b.length;i++)if(b.start(i)<=v.currentTime+0.2&&b.end(i)>=v.currentTime)return b.end(i)-v.currentTime;return 0}
  const iv=setInterval(()=>{const v=video(),st=party.snap.state,now=Date.now()
   const relevant=!!v&&!!st&&sameEp(st)&&!pending.current
   if(!reported){
    // A jump in the video (seeking) is not a slow connection: it is shared once it lands.
    const stuck=relevant&&st!.playing&&!v!.paused&&!v!.ended&&!v!.seeking&&now-lastSeek>4000&&v!.readyState<3
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
  return()=>{clearInterval(iv);document.removeEventListener('seeking',onSeek,true);if(reported)party.reportBuffer(false,0)}
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
    if(w.length&&st&&st.playing&&v&&sameEp(st)){const groupT=st.time+(now-(party.snap.stateAt||now))/1000*(st.rate||1);const behind=w.map(([,b])=>b.time).filter(x=>x>0&&x<=groupT+1&&x>=groupT-15);hold={time:Math.max(0,Math.min(groupT,...behind)),since:now};shareLocal({playing:false,time:hold.time});party.setWaiting(names(w))}
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
 const[hideCams,setHideCams]=useHideCams()
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
   {snap.status==='connecting'?<p className="wp-help"><span className="spinner"/> {snap.reconnecting?t('Reconnecting to the watch party…'):snap.role==='host'?t('Creating the watch party…'):t('Joining…')}</p>:<>
    <div className="wp-code"><span>{t('Code')}</span><b>{snap.code}</b><button onClick={()=>{navigator.clipboard?.writeText(snap.code).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000)}}>{copied?'✓':t('Copy')}</button></div>
    <button className="wp-invite" onClick={async()=>{const text=await inviteText(snap.code);navigator.clipboard?.writeText(text).catch(()=>{});(window as any).__lastInvite=text;setInvited(true);setTimeout(()=>setInvited(false),3000)}}>{invited?'✓ '+t('Invitation copied: paste it in Discord, WhatsApp…'):'🔗 '+t('Copy an invitation link')}</button>
    <div className="wp-members" aria-label={plural(snap.members.length,'{n} person','{n} people')}>{snap.members.map(m=><span key={m.id} className={'wp-member'+(m.voice?' in-voice':'')+(snap.speaking.includes(m.id)?' speaking':'')} title={m.voice?(m.muted?t('In the voice channel (muted)'):t('In the voice channel')):''}>{m.voice?(m.muted?'🔇 ':'🎙 '):''}{m.cam?'📷 ':''}{m.name}{m.id===snap.selfId?' ('+t('you')+')':''}</span>)}</div>
    <div className="wp-voice">{snap.voice==='off'?<button onClick={()=>party.voiceJoin()}>{'🎙 '+t('Join the voice channel')}</button>:snap.voice==='joining'?<span className="wp-help">{t('Allowing the microphone…')}</span>:<><button className={snap.muted?'danger':''} aria-pressed={snap.muted} onClick={()=>party.setMuted(!snap.muted)}>{snap.muted?'🔇 '+t('Unmute'):'🎙 '+t('Mute')}</button><label className="wp-vol" title={t('Volume of the voices')}>🔊<input type="range" min={0} max={1} step={0.05} defaultValue={voiceVolume()} onChange={e=>party.setVolume(Number(e.target.value))} aria-label={t('Volume of the voices')}/></label><button className="removebtn" onClick={()=>party.voiceLeave()}>{t('Leave the voice channel')}</button></>}</div>
    {snap.voice==='on'&&<div className="wp-voice-opts"><label className="wp-check"><input type="checkbox" checked={snap.ptt} onChange={e=>party.setPtt(e.target.checked)}/> {t('Push to talk (hold V)')}</label>{snap.ptt&&<span className={'wp-ptt'+(snap.talking?' on':'')}>{snap.talking?'🎙 '+t('Talking…'):t('Microphone off until you hold V')}</span>}<label className="wp-check"><input type="checkbox" defaultChecked={lsGet('partyDuck')!=='0'} onChange={e=>lsSet('partyDuck',e.target.checked?'1':'0')}/> {t('Lower the film while someone speaks')}</label></div>}
    {snap.voiceError&&<p className="wp-error" role="alert">{snap.voiceError}</p>}
    <div className="wp-voice">{snap.cam==='on'?<button className="removebtn" onClick={()=>party.camStop()}>{'📷 '+t('Turn my camera off')}</button>:<button disabled={snap.cam==='starting'} onClick={()=>party.camStart()}>{snap.cam==='starting'?t('Allowing the camera…'):'📷 '+t('Turn my camera on')}</button>}<label className="wp-check"><input type="checkbox" checked={hideCams} onChange={e=>setHideCams(e.target.checked)}/> {t("Hide the others' cameras")}</label></div>
    {snap.camError&&<p className="wp-error" role="alert">{snap.camError}</p>}
    {snap.voice==='on'&&<p className="wp-hint">{t('Tip: use headphones so the film does not come back through your microphone.')}</p>}
    {snap.missing&&<div className="wp-missing" role="status"><p>{t('You do not have the source "{name}". NovelReader looks for the same episode in your other sources.',{name:snap.missing.sourceName||'?'})}</p><button className="primary" disabled={snap.missingState==='installing'} onClick={()=>party.installMissing()}>{snap.missingState==='installing'?t('Installing…'):t('Install {name}',{name:snap.missing.sourceName||t('the source')})}</button>{snap.missingError&&<p className="wp-error">{snap.missingError}</p>}</div>}
    {snap.role==='host'&&<label className="wp-check"><input type="checkbox" defaultChecked={lsGet('partyWait')!=='0'} onChange={e=>lsSet('partyWait',e.target.checked?'1':'0')}/> {t('Wait for people whose video is loading')}</label>}
    {snap.state?.media?<div className="wp-now">▶ {snap.state.media.name}{snap.state.episodeName&&snap.state.media.kind!=='movie'?' · '+snap.state.episodeName:''}</div>:<div className="wp-now muted">{t('Open an episode: everyone will follow.')}</div>}
    <div className="wp-chat" ref={chatRef}>{snap.chat.map((c,i)=><div key={i} className={'wp-msg'+(c.mine?' mine':'')+(c.system?' system':'')}>{c.system?c.text:<><b>{c.name}</b> {c.text}</>}</div>)}</div>
    <form className="wp-say" onSubmit={e=>{e.preventDefault();party.say(text);setText('')}}><input value={text} onChange={e=>setText(e.target.value)} placeholder={t('Message…')} aria-label={t('Message')}/><button type="submit" disabled={!text.trim()}>{t('Send')}</button></form>
   </>}
   <div className="wp-leaves">{snap.role==='host'&&snap.members.length>1&&<button onClick={()=>party.handOver()}>{t('Leave ({name} becomes the host)',{name:snap.members[1].name})}</button>}<button className="removebtn wp-leave" onClick={()=>party.leave()}>{snap.role==='host'?t('End the watch party'):t('Leave')}</button></div>
  </div>}
 </aside>
}

// ---- Over the video: reactions, chat in fullscreen, fullscreen with the party ----
// During a party the whole player (video + this layer) goes fullscreen instead of
// the bare video, so the chat and the reactions stay visible.
type Fly={id:number,emoji:string,name:string,x:number}
export function PartyOverlay(){
 const snap=useParty(),active=snap.status==='ready'
 const[stage,setStage]=useState<HTMLElement|null>(null),[full,setFull]=useState(false),[flies,setFlies]=useState<Fly[]>([]),[typing,setTyping]=useState(false),[text,setText]=useState(''),[since]=useState(()=>Date.now()),[,tick]=useState(0)
 const inputRef=useRef<HTMLInputElement>(null),seq=useRef(0)
 // Find the player (it comes and goes with the pages).
 useEffect(()=>{if(!active){setStage(null);return}const look=()=>setStage(document.querySelector('.media-player-top .player-stage') as HTMLElement|null);look();const iv=setInterval(look,1000);return()=>clearInterval(iv)},[active])
 // The video's own fullscreen button would hide this layer: use ours instead.
 useEffect(()=>{const v=stage?.querySelector('video') as any;if(!v?.controlsList)return;v.controlsList.add('nofullscreen');const dbl=(e:MouseEvent)=>{if((e.target as HTMLElement).closest('.po-bar,.po-say'))return;e.preventDefault();toggleFull()};stage!.addEventListener('dblclick',dbl);return()=>{v.controlsList.remove('nofullscreen');stage!.removeEventListener('dblclick',dbl)}},[stage])
 useEffect(()=>{const f=()=>setFull(!!stage&&document.fullscreenElement===stage);f();document.addEventListener('fullscreenchange',f);return()=>document.removeEventListener('fullscreenchange',f)},[stage])
 useEffect(()=>party.onReact(r=>{const id=++seq.current;setFlies(fs=>[...fs.slice(-24),{id,emoji:r.emoji,name:r.mine?'':r.name,x:8+Math.random()*30}]);setTimeout(()=>setFlies(fs=>fs.filter(f=>f.id!==id)),3200)}),[])
 // Chat lines fade out after 10 s.
 useEffect(()=>{if(!full)return;const iv=setInterval(()=>tick(x=>x+1),1000);return()=>clearInterval(iv)},[full])
 // In fullscreen: Enter (or T) to write a message.
 useEffect(()=>{if(!full)return;const k=(e:KeyboardEvent)=>{if(typing||e.ctrlKey||e.altKey||e.metaKey)return;if(e.key==='Enter'||e.key==='t'||e.key==='T'){if((e.target as HTMLElement)?.tagName==='INPUT')return;e.preventDefault();setTyping(true)}};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[full,typing])
 useEffect(()=>{if(typing)setTimeout(()=>inputRef.current?.focus(),0)},[typing])
 function toggleFull(){if(!stage)return;if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else stage.requestFullscreen().catch(()=>{})}
 if(!active||!stage)return null
 const recent=snap.chat.filter(c=>c.at>=since&&Date.now()-c.at<10000).slice(-4)
 return createPortal(<div className={'party-overlay'+(full?' full':'')}>
  <div className="po-flies" aria-hidden="true">{flies.map(f=><span key={f.id} className="po-fly" style={{left:f.x+'%'}}>{f.emoji}{f.name&&<small>{f.name}</small>}</span>)}</div>
  {full&&(recent.length>0||typing)&&<div className="po-chat">{recent.map((c,i)=><div key={c.at+':'+i} className={'po-line'+(c.system?' system':'')}>{c.system?c.text:<><b>{c.mine?t('You'):c.name}</b> {c.text}</>}</div>)}
   {typing&&<form className="po-say" onSubmit={e=>{e.preventDefault();party.say(text);setText('');setTyping(false)}}><input ref={inputRef} value={text} maxLength={500} onChange={e=>setText(e.target.value)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){setTyping(false);setText('')}}} onBlur={()=>{if(!text)setTyping(false)}} placeholder={t('Message to the party…')} aria-label={t('Message to the party')}/></form>}</div>}
  <div className="po-bar">{REACTIONS.map(e=><button key={e} onClick={()=>party.react(e)} aria-label={t('React {emoji}',{emoji:e})}>{e}</button>)}
   <button onClick={()=>{if(full)setTyping(true);else{party.panelOpen=true;party.seen();window.dispatchEvent(new Event('nr-party-open'))}}} title={full?t('Write a message (Enter)'):t('Open the chat')} aria-label={t('Chat')}>💬{!full&&snap.unread>0&&<span className="po-badge">{snap.unread}</span>}</button>
   <button onClick={toggleFull} title={full?t('Exit fullscreen'):t('Fullscreen with the party chat (F)')} aria-label={full?t('Exit fullscreen'):t('Fullscreen')}>{full?'🗗':'⛶'}</button></div>
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
   <CamVideo stream={c.stream} mirror={c.me}/><figcaption>{c.me?t('You'):name(c.id)}</figcaption></figure>)}
 </div>
 return createPortal(node,(fs as HTMLElement)||document.body)
}
