// Watch party: watch an anime, a series or a movie together on several PCs and phones.
// Each device plays the video from its own sources; NovelReader keeps the same episode,
// play / pause and position everywhere (within a tenth of a second: common clock,
// small speed changes instead of jumps), with a chat, a voice channel and cameras.
// Someone who does not have the video can watch the stream of someone who has it.
// Connection: the free public PeerJS server only introduces the devices (6-letter
// code), then they talk directly (WebRTC). The host relays to every guest.
// Voice channel: each person in it calls the others directly (audio only).
// Versions: everything added after the first protocol is optional, so a person with
// an older NovelReader still joins (they just do not get the newer comforts).
// What is seen (panel, layer over the video, cameras) is in party-ui.tsx; the screen of
// someone who watches a stream is party-theater.tsx.
import{useEffect,useRef,useState}from'react'
import{t}from'../i18n'
import{lsGet,lsSet}from'../lib/util'
import{engineFetch}from'../lib/engine'
import{ClockSync,posNow,driftFix,describeChange,clockTime,opusMusic,epKey,DRIFT,type Action}from'../lib/party-sync'
import{StreamSource,streamQuality,canStream}from'./party-stream'
import{partySound}from'./party-sounds'

export type PartyMedia={kind:'anime'|'series'|'movie',sourceId:string,sourceName?:string,sourcePkg?:string,url:string,name:string,cover?:string,id?:string}
// What a PC needs to show the same episode; episodeNumber lets a PC without the source find it elsewhere.
export type PartyOpen={media:PartyMedia,episodeUrl:string,episodeName:string,episodeNumber?:number}
// at: the host's clock when the position was true. why: what was done (play, pause, seek,
// episode, rate), a regular report ('hb'), or the group's pause while a video loads
// ('wait', 'resume'). dur: length of the video (for those who watch a stream).
export type PartyState={media:PartyMedia|null,episodeUrl:string,episodeName:string,episodeNumber?:number,playing:boolean,time:number,rate:number,by:string,byId?:string,at?:number,why?:string,dur?:number}
export type Member={id:string,name:string,voice?:boolean,muted?:boolean,cam?:boolean,v?:number}
// What a person's player is doing (shown next to their name). ep: the episode it has open;
// buf: loading; view: whose stream this person watches; can: its video can be sent to others.
export type Presence={ep:string,pos:number,playing:boolean,buf:boolean,view:string,can:boolean,rtt:number|null,at:number}
type Line={name:string,text:string,at:number}
type Msg={t:'hello',name:string,v?:number}|{t:'welcome',v:number,lock:boolean,cast:string,history:Line[]}|{t:'members',list:Member[]}|{t:'state',s:PartyState}|{t:'chat',name:string,text:string,at:number}|{t:'voice',on:boolean,muted:boolean,cam?:boolean}|{t:'camfix',to:string,from:string,n:number}|{t:'buffer',on:boolean,time:number}|{t:'react',emoji:string,name:string}|{t:'wait',list:{id:string,name:string}[]}|{t:'bye',end?:boolean,next?:string,kicked?:boolean}|{t:'ping',c?:number}|{t:'pong',c:number,h:number}|{t:'me',p:Presence}|{t:'presence',list:(Presence&{id:string})[]}|{t:'typing',id:string,name:string}|{t:'opts',lock:boolean,cast:string}|{t:'cast',on:boolean}|{t:'count',at:number,name:string}|{t:'stream',op:'ask'|'stop'|'no',to:string,from:string,why?:string}|{t:'cue',to:string,from:string,text:string}
type Conn={id:string,send:(m:Msg)=>void,onMessage:(cb:(m:Msg)=>void)=>void,onClose:(cb:()=>void)=>void,close:()=>void}
type CallKind='voice'|'cam'|'stream'
type CallStats={state:string,inBytes:number,inFrames:number,outBytes:number,outFrames:number,height:number,fps:number}
// replace: same call, other tracks (the film changes episode). tune: ceiling on the bitrate
// and the height of a film sent to someone. smooth: a little waiting on arrival (a film is not a call).
type Call={peer:string,kind:CallKind,stats:()=>Promise<CallStats|null>,limit:(bps:number)=>void,tune:(q:{bps:number,height:number})=>void,replace:(s:MediaStream)=>void,smooth:(ms:number)=>void,answer:(s:MediaStream)=>void,onStream:(cb:(s:MediaStream)=>void)=>void,onClose:(cb:()=>void)=>void,close:()=>void}
type Transport={host:(code:string,onConn:(c:Conn)=>void)=>Promise<void>,join:(code:string,patience?:number)=>Promise<Conn>,destroy:()=>void,selfId:()=>string,call:(peer:string,s:MediaStream,kind?:CallKind,codec?:string)=>Call,onCall:(cb:(c:Call)=>void)=>void}

// ---- Transports ------------------------------------------------------------------
// Camera bubbles stay light so the film keeps the bandwidth.
function capBitrate(pc:()=>RTCPeerConnection|undefined,bps:number){let n=0;const go=()=>{const p=pc();const ss=p?.getSenders().filter(x=>x.track?.kind==='video')||[];if(!ss.length){if(++n<20)setTimeout(go,500);return}for(const sd of ss){try{const prm=sd.getParameters();if(!prm.encodings||!prm.encodings.length)prm.encodings=[{}];prm.encodings[0].maxBitrate=bps;(prm as any).degradationPreference='maintain-framerate';sd.setParameters(prm).catch(()=>{})}catch{}}};go()}
// What flows on a call: used to notice a camera that connects but shows nothing.
async function callStats(pc:RTCPeerConnection|undefined):Promise<CallStats|null>{
 if(!pc)return null
 const out:CallStats={state:pc.connectionState,inBytes:0,inFrames:0,outBytes:0,outFrames:0,height:0,fps:0}
 try{(await pc.getStats()).forEach((r:any)=>{if(r.kind!=='video'&&r.mediaType!=='video')return;if(r.type==='inbound-rtp'){out.inBytes+=r.bytesReceived||0;out.inFrames+=r.framesDecoded||0;out.height=r.frameHeight||out.height;out.fps=r.framesPerSecond||out.fps}else if(r.type==='outbound-rtp'){out.outBytes+=r.bytesSent||0;out.outFrames+=r.framesEncoded||0;out.height=out.height||r.frameHeight||0}})}catch{return null}
 return out}
// The film sent to someone: a ceiling on the bitrate and on the height of the picture.
function tuneVideo(pc:()=>RTCPeerConnection|undefined,q:{bps:number,height:number}){let n=0;const go=()=>{const p=pc();const ss=p?.getSenders().filter(x=>x.track?.kind==='video')||[];if(!ss.length){if(++n<20)setTimeout(go,500);return}for(const sd of ss){try{const prm=sd.getParameters();if(!prm.encodings||!prm.encodings.length)prm.encodings=[{}];const h=Number(sd.track?.getSettings().height)||0;prm.encodings[0].maxBitrate=q.bps;prm.encodings[0].scaleResolutionDownBy=h>q.height?h/q.height:1;(prm as any).degradationPreference='balanced';sd.setParameters(prm).catch(()=>{})}catch{}}};go()}
// Same call, other tracks: what the call sends follows the video (another episode, another quality).
function swapTracks(pc:RTCPeerConnection|undefined,s:MediaStream){if(!pc)return;for(const tr of pc.getTransceivers()){const kind=tr.sender.track?.kind||tr.receiver.track?.kind;const next=(kind==='video'?s.getVideoTracks()[0]:kind==='audio'?s.getAudioTracks()[0]:null)||null;if(tr.sender.track!==next)tr.sender.replaceTrack(next).catch(()=>{})}}
function smoothPlayout(pc:RTCPeerConnection|undefined,ms:number){try{for(const r of pc?.getReceivers()||[])(r as any).jitterBufferTarget=ms}catch{}}
const kindOf=(k:any):CallKind=>k==='cam'?'cam':k==='stream'?'stream':'voice'
// Puts one video format first in a call offer (VP8, H264, VP9): when a camera shows
// black with one (an encoder or decoder of that PC), the next try uses another.
export function preferVideoCodec(sdp:string,codec:string):string{
 const lines=sdp.split('\r\n'),mi=lines.findIndex(l=>l.startsWith('m=video'));if(mi<0||!codec)return sdp
 const want=new Set<string>();for(const l of lines){const m=/^a=rtpmap:(\d+) ([A-Za-z0-9]+)\//.exec(l);if(m&&m[2].toUpperCase()===codec.toUpperCase())want.add(m[1])}
 if(!want.size)return sdp
 // The retransmission formats (rtx) of the chosen ones follow them.
 for(const l of lines){const m=/^a=fmtp:(\d+) apt=(\d+)/.exec(l);if(m&&want.has(m[2]))want.add(m[1])}
 const parts=lines[mi].split(' '),head=parts.slice(0,3),pts=parts.slice(3)
 lines[mi]=[...head,...pts.filter(x=>want.has(x)),...pts.filter(x=>!want.has(x))].join(' ')
 return lines.join('\r\n')}
const CAM_CODECS=['H264','VP9','VP8']
// Tests shorten the wait.
const CAM_WAIT=Number((globalThis as any).__partyCamWait)||7000,CAM_CHECKS=4
const PREFIX='novelreader-wp-'
async function peerTransport():Promise<Transport>{
 const{default:Peer}=await import('peerjs')
 let peer:any=null
 // The code only works while this PC is registered on the connection server. That
 // link drops now and then (server restart, Wi-Fi hiccup, PC waking up); without
 // this, the party kept running between those already in it but nobody could join
 // any more ("No watch party with this code"). Registered again, with the same code.
 const stayRegistered=(p:any)=>{let timer:any=null
  const again=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(p!==peer||p.destroyed)return;if(p.disconnected){try{p.reconnect()}catch{}again()}},2500)}
  p.on('disconnected',again)
  // Belt and braces: checked every 20 s, and when the PC comes back online or wakes up.
  const check=()=>{if(p!==peer||p.destroyed){clearInterval(iv);window.removeEventListener('online',check);return}if(p.disconnected)again()}
  const iv=setInterval(check,20000);window.addEventListener('online',check)
  if((window as any).__partyDebug)(window as any).__partyPeer=p}
 const wrap=(c:any):Conn=>({id:String(c.peer),send:m=>{try{c.open&&c.send(m)}catch{}},onMessage:cb=>c.on('data',(d:any)=>cb(d as Msg)),onClose:cb=>{c.on('close',cb);c.on('error',cb)},close:()=>{try{c.close()}catch{}}})
 const failure=(e:any)=>new Error(e?.type==='peer-unavailable'?t('No watch party with this code. Check the code with your friend.'):e?.type==='unavailable-id'?'taken':e?.type==='network'||e?.type==='server-error'||e?.type==='socket-error'?t('Could not reach the connection server. Check your internet connection.'):String(e?.message||e))
 return{
  host:(code,onConn)=>new Promise((res,rej)=>{peer=new Peer(PREFIX+code.toLowerCase(),{debug:0});stayRegistered(peer);peer.on('open',()=>res());peer.on('error',(e:any)=>rej(failure(e)));peer.on('connection',(c:any)=>c.on('open',()=>onConn(wrap(c))))}),
  // The host may be re-registering at this very moment (its link to the server
  // dropped for a few seconds): "no such party" is only believed after four tries.
  join:(code,patience=0)=>new Promise((res,rej)=>{peer=new Peer({debug:0});stayRegistered(peer);let tries=0,done=false
   const attempt=()=>{if(done||!peer||peer.destroyed)return;tries++;const c=peer.connect(PREFIX+code.toLowerCase(),{reliable:true});c.on('open',()=>{done=true;res(wrap(c))})}
   peer.on('error',(e:any)=>{if(done)return;if(e?.type==='peer-unavailable'&&tries<4){setTimeout(attempt,3000);return}if(e?.type==='network'||e?.type==='disconnected'||e?.type==='socket-closed')return;done=true;rej(failure(e))})
   peer.on('open',()=>{if(!tries)attempt()})
   setTimeout(()=>{if(!done){done=true;rej(new Error(t('No answer from this watch party. Check the code with your friend.')))}},patience||25000)}),
  destroy:()=>{try{peer?.destroy()}catch{}peer=null},
  selfId:()=>String(peer?.id||''),
  call:(id,stream,kind='voice',codec='')=>wrapCall(peer.call(id,stream,{metadata:{kind},...(kind==='stream'?{sdpTransform:(sdp:string)=>opusMusic(sdp)}:codec?{sdpTransform:(sdp:string)=>preferVideoCodec(sdp,codec)}:{})})),
  onCall:cb=>{peer.on('call',(mc:any)=>cb(wrapCall(mc)))}
 }
 function wrapCall(mc:any):Call{const kind=kindOf(mc.metadata?.kind);return{peer:String(mc.peer),kind,stats:()=>callStats(mc.peerConnection),limit:bps=>capBitrate(()=>mc.peerConnection,bps),tune:q=>tuneVideo(()=>mc.peerConnection,q),replace:s=>swapTracks(mc.peerConnection,s),smooth:ms=>smoothPlayout(mc.peerConnection,ms),answer:st=>mc.answer(st&&st.getTracks().length?st:undefined,kind==='stream'?{sdpTransform:(sdp:string)=>opusMusic(sdp)}:undefined),onStream:cb=>mc.on('stream',cb),onClose:cb=>{mc.on('close',cb);mc.on('error',cb)},close:()=>{try{mc.close()}catch{}}}}
}
// Tests: two windows of the same browser talk through a BroadcastChannel.
function fakeTransport():Transport{
 let chans:BroadcastChannel[]=[]
 let me=Math.random().toString(36).slice(2,8)
 const sig=new BroadcastChannel('wp-voice');chans.push(sig)
 const pcs=new Map<string,RTCPeerConnection>();let onCallCb:(c:Call)=>void=()=>{}
 const mkCall=(peer:string,id:string,pc:RTCPeerConnection,incoming?:RTCSessionDescriptionInit,kind:CallKind='voice'):Call=>{let onS:(s:MediaStream)=>void=()=>{},onC:()=>void=()=>{};pc.ontrack=e=>onS(e.streams[0]);pc.onicecandidate=e=>{if(e.candidate)sig.postMessage({to:peer,from:me,id,ice:e.candidate.toJSON()})};pc.onconnectionstatechange=()=>{if(['closed','failed'].includes(pc.connectionState))onC()}
  return{peer,kind,stats:()=>(window as any).__partyCamBlack?.(peer,kind)?Promise.resolve({state:'connected',inBytes:0,inFrames:0,outBytes:1,outFrames:1,height:0,fps:0}):callStats(pc),limit:bps=>capBitrate(()=>pc,bps),tune:q=>tuneVideo(()=>pc,q),replace:s=>swapTracks(pc,s),smooth:ms=>smoothPlayout(pc,ms),answer:async st=>{for(const tr of st.getTracks())pc.addTrack(tr,st);await pc.setRemoteDescription(incoming!);let a=await pc.createAnswer();if(kind==='stream'&&a.sdp)a={type:a.type,sdp:opusMusic(a.sdp)};await pc.setLocalDescription(a);sig.postMessage({to:peer,from:me,id,answer:a})},onStream:cb=>{onS=cb},onClose:cb=>{onC=cb},close:()=>{pc.close();sig.postMessage({to:peer,from:me,id,bye:1});onC()}}}
 sig.onmessage=async e=>{const d=e.data;if(d.to!==me)return;const pc=pcs.get(d.id)
  if(d.offer){const p2=new RTCPeerConnection();pcs.set(d.id,p2);onCallCb(mkCall(d.from,d.id,p2,d.offer,kindOf(d.kind)))}
  else if(d.answer&&pc)await pc.setRemoteDescription(d.answer)
  else if(d.ice&&pc)await pc.addIceCandidate(d.ice).catch(()=>{})
  // (The other side hung up. Like on the real network, this end is not told at once: whoever
  // needs to know says so in a message, or sees it in the other person's status.)
  else if(d.bye&&pc){pc.close();pcs.delete(d.id)}}
 const pipe=(name:string,peerId:string):Conn=>{const ch=new BroadcastChannel(name);chans.push(ch);let onMsg:(m:Msg)=>void=()=>{},onClose:()=>void=()=>{};ch.onmessage=e=>{const d=e.data;if(d.from===me)return;if(d.bye)onClose();else onMsg(d.m)};return{id:peerId,send:m=>ch.postMessage({from:me,m}),onMessage:cb=>{onMsg=cb},onClose:cb=>{onClose=cb},close:()=>{ch.postMessage({from:me,bye:1});ch.close()}}}
 return{
  // (A code already hosted by another window answers "here": taken, like on the real server.)
  host:async(code,onConn)=>{const lobby=new BroadcastChannel('wp-'+code);chans.push(lobby);const taken=await new Promise<boolean>(r=>{const tm=setTimeout(()=>r(false),500);lobby.onmessage=e=>{if(e.data?.here){clearTimeout(tm);r(true)}};lobby.postMessage({who:1})});if(taken){lobby.close();throw new Error('taken')}me='host';lobby.onmessage=e=>{if(e.data?.who)lobby.postMessage({here:1});else if(e.data?.knock){const c=pipe('wp-'+code+'-'+e.data.knock,e.data.knock);lobby.postMessage({welcome:e.data.knock});onConn(c)}}},
  join:code=>new Promise((res,rej)=>{const lobby=new BroadcastChannel('wp-'+code);chans.push(lobby);const tm=setTimeout(()=>rej(new Error(t('No watch party with this code. Check the code with your friend.'))),1500);lobby.onmessage=e=>{if(e.data?.welcome===me){clearTimeout(tm);res(pipe('wp-'+code+'-'+me,'host'))}};lobby.postMessage({knock:me})}),
  destroy:()=>{for(const p of pcs.values())p.close();pcs.clear();for(const c of chans)try{c.close()}catch{}chans=[]},
  selfId:()=>me,
  call:(peer,stream,kind='voice',codec='')=>{const id=Math.random().toString(36).slice(2);const pc=new RTCPeerConnection();pcs.set(id,pc);const c=mkCall(peer,id,pc,undefined,kind);if(kind==='cam')((window as any).__partyCamCalls=(window as any).__partyCamCalls||[]).push(codec);if(kind==='stream')((window as any).__partyStreamCalls=(window as any).__partyStreamCalls||[]).push({peer,pc});for(const tr of stream.getTracks())pc.addTrack(tr,stream);pc.createOffer().then(async o=>{if(kind==='stream'&&o.sdp)o={type:o.type,sdp:opusMusic(o.sdp)};else if(codec&&o.sdp)o={type:o.type,sdp:preferVideoCodec(o.sdp,codec)};await pc.setLocalDescription(o);sig.postMessage({to:peer,from:me,id,offer:o,kind})});return c},
  onCall:cb=>{onCallCb=cb}
 }
}

// ---- Party (one per window, survives page changes) -------------------------------
type Chat={name:string,text:string,at:number,mine?:boolean,system?:boolean,old?:boolean,act?:string}
// A stream being watched: whose, and how far the connection is (why: the sender's reason when it cannot).
export type View={id:string,state:'asking'|'on'|'error',error:string,why:string,stream:MediaStream|null}
// v2: the host speaks the newer protocol (clock, presence, streams). synced: this PC's clock is in
// step with the host's. lock: only the host drives the video. cast: who sends their video to everyone.
type Snapshot={role:''|'host'|'guest',code:string,status:'idle'|'connecting'|'ready'|'error',error:string,members:Member[],chat:Chat[],unread:number,state:PartyState|null,stateAt:number,voice:'off'|'joining'|'on',muted:boolean,speaking:string[],voiceError:string,selfId:string,waiting:{id:string,name:string}[],missing:PartyMedia|null,missingState:''|'installing'|'error',missingError:string,reconnecting:boolean,ptt:boolean,talking:boolean,cam:'off'|'starting'|'on',camError:string,camLocal:MediaStream|null,cams:{id:string,stream:MediaStream,live?:boolean}[],v2:boolean,synced:boolean,rtt:number|null,lock:boolean,cast:string,presence:Record<string,Presence>,typing:{id:string,name:string}[],count:{at:number,name:string}|null,view:View|null,viewers:string[],cue:string,room:boolean}
const PROTOCOL=2
const FRESH={v2:false,synced:false,rtt:null,lock:false,cast:'',presence:{},typing:[],count:null,view:null,viewers:[],cue:'',room:false}
export const REACTIONS=['😂','❤️','😮','😱','🔥','👏','😢']
const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode=()=>Array.from({length:6},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('')
export const partyName=()=>lsGet('partyName')||''
// ---- My room: the same code every time, so friends keep one link --------------------
const validCode=(c:any)=>typeof c==='string'&&/^[A-Z0-9]{6}$/.test(c)
export const roomFixed=()=>lsGet('partyFixed')!=='0'
export function roomCode(renew=false):string{const cur=lsGet('partyRoom');if(!renew&&validCode(cur))return cur as string;const c=newCode();lsSet('partyRoom',c);return c}
// The parties joined lately (code and host), to go back in one click.
export type Recent={code:string,name:string,at:number}
export function recentParties():Recent[]{try{const l=JSON.parse(lsGet('partyRecent')||'[]');return Array.isArray(l)?l.filter((x:any)=>validCode(x?.code)).map((x:any)=>({code:x.code,name:String(x.name||'').slice(0,30),at:Number(x.at)||0})).slice(0,4):[]}catch{return[]}}
function rememberParty(code:string,name:string){if(!validCode(code)||!name)return;const l=[{code,name,at:Date.now()},...recentParties().filter(x=>x.code!==code)].slice(0,4);lsSet('partyRecent',JSON.stringify(l));window.dispatchEvent(new Event('nr-party-recent'))}
export function forgetParty(code:string){lsSet('partyRecent',JSON.stringify(recentParties().filter(x=>x.code!==code)));window.dispatchEvent(new Event('nr-party-recent'))}
const onPhone=()=>!!(window as any).Capacitor
const cleanPresence=(p:any):Presence=>({ep:String(p?.ep||'').slice(0,600),pos:Number(p?.pos)||0,playing:!!p?.playing,buf:!!p?.buf,view:String(p?.view||'').slice(0,80),can:!!p?.can,rtt:p?.rtt==null?null:Math.max(0,Math.min(9999,Number(p.rtt)||0)),at:Number(p?.at)||0})

class Party{
 snap:Snapshot={role:'',code:'',status:'idle',error:'',members:[],chat:[],unread:0,state:null,stateAt:0,voice:'off',muted:false,speaking:[],voiceError:'',selfId:'',waiting:[],missing:null,missingState:'',missingError:'',reconnecting:false,ptt:lsGet('partyPtt')==='1',talking:false,cam:'off',camError:'',camLocal:null,cams:[],...FRESH}
 private subs=new Set<()=>void>()
 private transport:Transport|null=null
 private conns:Conn[]=[]
 private names=new Map<string,string>()
 private vers=new Map<string,number>()
 onRemoteState:((s:PartyState)=>void)|null=null
 panelOpen=false
 subscribe(f:()=>void){this.subs.add(f);return()=>{this.subs.delete(f)}}
 private set(p:Partial<Snapshot>){this.snap={...this.snap,...p};for(const f of this.subs)f()}
 private async make(){return (window as any).__partyFake?fakeTransport():await peerTransport()}
 private myName=''
 private me(){return this.myName||partyName()||t('Guest')}
 private nameOf(id:string){return id===this.snap.selfId?this.me():this.snap.members.find(x=>x.id===id)?.name||this.names.get(id)||t('Guest')}
 private system(text:string){this.addChat({name:'',text,at:Date.now(),system:true})}
 private addChat(c:Chat){this.set({chat:[...this.snap.chat,c].slice(-200),unread:this.panelOpen||c.mine||c.system?this.snap.unread:this.snap.unread+1})}
 // The clock everyone agrees on is the host's. A guest knows it once the host has answered
 // a ping (null before that, and with a host on an older version).
 private clock=new ClockSync()
 hostNow():number|null{return this.snap.role==='host'?Date.now():this.snap.role==='guest'&&this.clock.ready()?Date.now()+this.clock.offset():null}
 private asHost(code:string,room:boolean){
  // (Taking over as host after the old one vanished: a stream for everyone that this PC followed is over.)
  const followed=!!this.snap.cast&&this.snap.cast!==this.snap.selfId&&!this.ownSources&&!!this.snap.state?.media
  this.transport!.onCall(c=>this.route(c));this.set({role:'host',code,status:'ready',reconnecting:false,selfId:this.transport!.selfId(),v2:true,synced:true,rtt:0,lock:lsGet('partyLock')==='1',cast:'',room});this.sendMembers();this.keepAlive()
  if(followed)window.dispatchEvent(new Event('nr-party-reopen'))}
 async host(){
  this.leave();this.myName=partyName()||t('Guest');this.set({role:'host',status:'connecting',error:'',members:[],chat:[]})
  // My room first (same code as always). Taken: a friend who became the host is still in it
  // (I join them), or the connection server has not let go of my last session yet (another code for now).
  const mine=roomFixed()?roomCode():''
  if(mine){
   try{this.transport=await this.make();await this.transport.host(mine,c=>this.accept(c));this.asHost(mine,true);this.system(t('Your room is open. Share the code {code}.',{code:mine}));return}
   catch(e:any){this.transport?.destroy();this.transport=null;if(e?.message!=='taken'){this.set({status:'error',error:String(e?.message||e),role:''});return}}
   try{this.set({role:'guest',code:mine});await this.connectGuest(mine,6000);this.system(t('Your room was already open: you joined it.'));return}
   catch{this.transport?.destroy();this.transport=null;this.set({role:'host',code:''})}
  }
  for(let i=0;i<4;i++){const code=newCode();try{this.transport=await this.make();await this.transport.host(code,c=>this.accept(c));this.asHost(code,false);this.system(mine?t('Your usual code is busy for the moment: this party uses the code {code}.',{code}):t('Watch party created. Share the code {code}.',{code}));return}catch(e:any){this.transport?.destroy();this.transport=null;if(e?.message!=='taken'){this.set({status:'error',error:String(e?.message||e),role:''});return}}}
  this.set({status:'error',error:t('Could not reach the connection server. Check your internet connection.'),role:''})
 }
 /** room: the name of the friend whose room this is, when it comes from the rooms joined before. */
 async join(code:string,room=''){
  const c=code.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length!==6){this.set({status:'error',error:t('The code has 6 letters or numbers.')});return}
  this.leave();this.myName=partyName()||t('Guest');this.set({role:'guest',code:c,status:'connecting',error:'',chat:[]})
  try{await this.connectGuest(c)}
  catch(e:any){this.transport?.destroy();this.transport=null;const msg=String(e?.message||e)
   // A room joined before that does not answer is simply closed for now (the code is not wrong).
   const closed=msg===t('No watch party with this code. Check the code with your friend.')||msg===t('No answer from this watch party. Check the code with your friend.')
   this.set({status:'error',error:room&&closed?t('The room of {name} is not open right now.',{name:room}):msg,role:''})}
 }
 private async connectGuest(code:string,patience=0){
  this.transport=await this.make();const conn=await this.transport.join(code,patience);this.conns=[conn];this.seen_.set(conn,Date.now());this.clock.reset()
  conn.onMessage(m=>{this.seen_.set(conn,Date.now());this.receive(m,conn)})
  conn.onClose(()=>{if(this.snap.role==='guest'&&this.conns.includes(conn))this.lost()})
  this.transport.onCall(c=>this.route(c));conn.send({t:'hello',name:this.me(),v:PROTOCOL});this.set({status:'ready',selfId:this.transport.selfId(),reconnecting:false,v2:false,synced:false,rtt:null});this.keepAlive()
  // The clock: a few quick pings at once (the quickest round trip is the one kept), then one with every keep-alive.
  for(const d of [0,250,600,1200,2000])setTimeout(()=>{if(this.conns[0]===conn)conn.send({t:'ping',c:Date.now()})},d)
 }
 // ---- Staying connected ----
 // Every PC sends a small "ping" every 3 s. A guest that hears nothing from the host
 // for 10 s reconnects; if the host is gone for good, the first guest becomes the
 // host under the same code and the others join it. The host drops a silent guest
 // after 15 s. The host answers a guest's ping with its clock ("pong").
 private seen_=new Map<Conn,number>()
 private alive:any=null
 private recovering=false
 private keepAlive(){clearInterval(this.alive);let n=0;this.alive=setInterval(()=>{const now=Date.now();n++
  if(n%3===0){
   for(const c of this.conns)c.send(this.snap.role==='guest'?{t:'ping',c:now}:{t:'ping'})
   if(this.snap.role==='host')for(const c of [...this.conns])if(now-(this.seen_.get(c)||now)>15000){c.close();this.dropGuest(c)}}
  // A recent host says something every 2 or 3 s: 8 s of silence is a lost link (10 s with an older one).
  if(this.snap.role==='guest'){const c=this.conns[0];if(c&&now-(this.seen_.get(c)||now)>(this.snap.v2?8000:10000)){this.lost();return}}
  if(n%2===0)this.presenceTick()
  this.forgetTyping(now)
  if(this.snap.count&&(this.hostNow()??now)>this.snap.count.at+1500)this.set({count:null})},1000)}
 private dropGuest(c:Conn){if(!this.conns.includes(c))return;const quiet=this.kicked.delete(c.id);this.conns=this.conns.filter(x=>x!==c);this.seen_.delete(c);const n=this.names.get(c.id);this.names.delete(c.id);this.vers.delete(c.id);this.theirs.delete(c.id);this.typingAt.delete(c.id);this.voiceOf.delete(c.id);this.hangUp(c.id);this.stopServing(c.id);if(this.snap.view?.id===c.id)this.dropView();this.noteBuffer(c.id,false,0);if(n&&!quiet){this.system(t('{name} left.',{name:n}));partySound('leave')}if(this.snap.cast===c.id){this.applyCast('');this.sendOpts();this.system(t('The stream for everyone ended.'))}this.sendMembers()}
 private closeLinks(){clearInterval(this.alive);this.alive=null;this.voiceLeave(true);this.camStop(true);for(const c of this.camIn.values()){try{c.close()}catch{}}this.camIn.clear();this.dropView();this.stopServing();this.set({cams:[],typing:[],presence:{},viewers:[],count:null});for(const c of this.conns)c.close();this.conns=[];this.seen_.clear();this.names.clear();this.vers.clear();this.theirs.clear();this.typingAt.clear();this.mine=null;this.voiceOf.clear();this.buffering.clear();this.transport?.destroy();this.transport=null}
 private lost(next?:string){
  if(this.recovering||!this.snap.role)return
  const code=this.snap.code,self=this.snap.selfId,members=this.snap.members,hostId=members[0]?.id
  const successor=next||members.find(m=>m.id!==hostId)?.id||''
  this.recovering=true;this.closeLinks()
  this.set({status:'connecting',reconnecting:true,waiting:[]})
  if(!next)this.system(t('Connection to the watch party lost. Reconnecting…'))
  ;(async()=>{const until=Date.now()+60000;let joinFails=0
   // The old host needs a moment to let go of the code.
   if(next)await new Promise(r=>setTimeout(r,successor===self?500:1200))
   while(this.recovering&&Date.now()<until){
    // The successor takes over the code once the old host has been gone a few seconds.
    if(successor===self&&(next||joinFails>=2)){try{this.transport=await this.make();await this.transport.host(code,c=>this.accept(c));this.asHost(code,this.snap.room);this.system(t('You are now the host of the watch party.'));this.recovering=false;return}catch{this.transport?.destroy();this.transport=null}}
    else{try{this.set({role:'guest'});await this.connectGuest(code,6000);this.recovering=false;this.system(t('Reconnected.'));return}catch{this.transport?.destroy();this.transport=null;joinFails++}}
    await new Promise(r=>setTimeout(r,1000))}
   if(this.recovering){this.recovering=false;this.leave(t('Could not reconnect to the watch party.'))}})()
 }
 // The host leaves but the party goes on: the first guest becomes the host.
 private handingOver=false
 handOver(){if(this.snap.role!=='host'||!this.conns.length)return this.leave();const next=this.conns[0].id;this.handingOver=true;for(const c of this.conns)c.send({t:'bye',next});setTimeout(()=>{this.leave('',true);this.handingOver=false},200)}
 /** The host removes someone (they can come back with the code). */
 kick(id:string){if(this.snap.role!=='host')return;const c=this.conns.find(x=>x.id===id);if(!c)return;const name=this.names.get(id)||t('Guest');this.kicked.add(id);c.send({t:'bye',kicked:true});this.system(t('{name} was removed from the watch party.',{name}));setTimeout(()=>{c.close();this.dropGuest(c)},150)}
 private kicked=new Set<string>()
 private accept(c:Conn){
  if(this.handingOver){c.close();return}
  this.conns.push(c);this.seen_.set(c,Date.now());c.onMessage(m=>{this.seen_.set(c,Date.now());this.receive(m,c)})
  c.onClose(()=>this.dropGuest(c))
 }
 private voiceOf=new Map<string,{on:boolean,muted:boolean,cam?:boolean}>()
 private sendMembers(){const self=this.transport?.selfId()||'me',mine={on:this.snap.voice==='on',muted:this.snap.muted};const list:Member[]=[{id:self,name:this.me(),voice:mine.on,muted:mine.muted,cam:this.snap.cam==='on',v:PROTOCOL},...this.conns.map(c=>({id:c.id,name:this.names.get(c.id)||'…',voice:!!this.voiceOf.get(c.id)?.on,muted:!!this.voiceOf.get(c.id)?.muted,cam:!!this.voiceOf.get(c.id)?.cam,v:this.vers.get(c.id)||1}))];this.set({members:list});for(const c of this.conns)c.send({t:'members',list});this.syncCams()}
 private receive(m:Msg,from:Conn){
  const host=this.snap.role==='host',self=this.snap.selfId
  // A message for one person goes through the host, which hands it over (and says who it is from).
  if((m.t==='stream'||m.t==='cue')&&host){m.from=from.id;if(m.to!==self){this.conns.find(x=>x.id===m.to)?.send(m);return}}
  if(m.t==='hello'&&host){const v=Number(m.v)||1;this.names.set(from.id,String(m.name||t('Guest')).slice(0,30));this.vers.set(from.id,v);this.system(t('{name} joined.',{name:this.names.get(from.id)!}));partySound('join');this.sendMembers()
   // Newer versions also get the options of the party and the last messages (someone who comes back finds the conversation).
   if(v>=2)from.send({t:'welcome',v:PROTOCOL,lock:this.snap.lock,cast:this.snap.cast,history:this.snap.chat.filter(c=>!c.system).slice(-30).map(c=>({name:c.mine?this.me():c.name,text:c.text,at:c.at}))})
   if(this.snap.state)from.send({t:'state',s:this.snap.state})}
  else if(m.t==='welcome'&&!host){const had=this.snap.chat.some(c=>!c.system);const hist:Chat[]=had?[]:(Array.isArray(m.history)?m.history:[]).slice(-30).map(x=>({name:String(x?.name||'').slice(0,30),text:String(x?.text||'').slice(0,500),at:Number(x?.at)||0,old:true}));this.set({v2:true,lock:!!m.lock,chat:hist.length?[...hist,...this.snap.chat]:this.snap.chat});this.applyCast(String(m.cast||''))}
  else if(m.t==='ping'){if(host&&m.c!=null)from.send({t:'pong',c:Number(m.c),h:Date.now()})}
  else if(m.t==='pong'&&!host){this.clock.sample(Number(m.c),Number(m.h),Date.now());const rtt=this.clock.rtt();if(!this.snap.synced||rtt!==this.snap.rtt)this.set({synced:this.clock.ready(),rtt})}
  else if(m.t==='bye'&&!host){if(m.next){const hostName=this.snap.members[0]?.name||'';const nn=this.snap.members.find(x=>x.id===m.next)?.name||'';this.system(t('{host} left; {name} is now the host.',{host:hostName,name:nn}));this.lost(String(m.next))}else this.leave(m.kicked?t('The host removed you from the watch party.'):t('The host closed the watch party.'))}
  else if(m.t==='members'){const first=!this.snap.members.length,before=this.snap.members;this.set({members:m.list});this.syncCalls();this.syncCams()
   // (A guest hears people come and go too: the host says who is there.)
   if(!first&&!host){if(m.list.some(x=>x.id!==self&&!before.some(y=>y.id===x.id)))partySound('join');else if(before.some(y=>y.id!==self&&!m.list.some(x=>x.id===y.id)))partySound('leave')}
   if(first&&!host&&m.list[0]?.name&&m.list[0].id!==self&&this.snap.code!==lsGet('partyRoom'))rememberParty(this.snap.code,String(m.list[0].name))
   // The person whose stream I watched is gone; or they are back (I reconnected): ask again.
   const v=this.snap.view;if(v&&!m.list.some(x=>x.id===v.id))this.dropView();else if(!v&&this.wantView&&m.list.some(x=>x.id===this.wantView))this.watch(this.wantView)
   for(const id of [...this.streamOut.keys()])if(!m.list.some(x=>x.id===id))this.stopServing(id)}
  else if(m.t==='voice'&&host){this.voiceOf.set(from.id,{on:!!m.on,muted:!!m.muted,cam:!!m.cam});if(!m.on)this.hangUp(from.id);this.sendMembers();this.syncCalls()}
  else if(m.t==='camfix'){if(m.to===self){if(this.snap.cam==='on'&&Number(m.n)>(this.camTry.get(String(m.from))||0)&&Number(m.n)<=3)this.camAgain(String(m.from),Number(m.n))}else if(host){const k=this.conns.find(x=>x.id===m.to);k?.send(m)}}
  else if(m.t==='chat'){const name=String(m.name||'').slice(0,30);this.addChat({name,text:String(m.text).slice(0,500),at:m.at});if(!this.panelOpen)partySound('message');for(const[id,x]of this.typingAt)if(x.name===name){this.typingAt.delete(id);this.pushTyping()}if(host)this.relay(m,from)}
  else if(m.t==='react'){if(REACTIONS.includes(m.emoji)){this.emitReact(m.emoji,String(m.name||'').slice(0,30));if(host)this.relay(m,from)}}
  else if(m.t==='buffer'&&host)this.noteBuffer(from.id,!!m.on,Number(m.time)||0)
  else if(m.t==='wait'&&!host)this.set({waiting:(m.list||[]).map(x=>({id:String(x.id),name:String(x.name)}))})
  else if(m.t==='me'&&host)this.theirs.set(from.id,cleanPresence(m.p))
  else if(m.t==='presence'&&!host){const map:Record<string,Presence>={};for(const x of Array.isArray(m.list)?m.list:[])map[String(x?.id)]=cleanPresence(x);this.set({presence:map});this.retryView();this.pruneViewers()}
  else if(m.t==='typing'){const id=host?from.id:String(m.id||''),name=String(m.name||'').slice(0,30);if(id&&id!==self){this.typingAt.set(id,{name,until:Date.now()+4000});this.pushTyping()}if(host)this.relay({t:'typing',id,name},from)}
  else if(m.t==='opts'&&!host){const lock=!!m.lock;if(lock!==this.snap.lock){this.set({lock});this.system(lock?t('Only the host controls the playback now.'):t('Everyone can control the playback again.'))}const cast=String(m.cast||'');if(cast!==this.snap.cast){this.system(cast?t('{name} is sending their video to everyone.',{name:this.nameOf(cast)}):t('The stream for everyone ended.'));this.applyCast(cast)}}
  else if(m.t==='cast'&&host)this.hostCast(m.on?from.id:this.snap.cast===from.id?'':this.snap.cast)
  else if(m.t==='count'){const at=Number(m.at);if(!Number.isFinite(at)||(host&&this.snap.lock&&from.id!==this.snap.cast))return;this.set({count:{at,name:String(m.name||'').slice(0,30)}});if(host)this.relay(m,from)}
  else if(m.t==='stream'){if(m.to!==self)return;const peer=String(m.from||'');if(m.op==='ask')this.serve(peer);else if(m.op==='stop')this.stopServing(peer);else if(m.op==='no'&&this.snap.view?.id===peer)this.viewFailed(String(m.why||''))}
  // (The picture of a stream arrives a moment after the message: the subtitle waits for it.)
  else if(m.t==='cue'){const peer=String(m.from||''),text=String(m.text||'').slice(0,600);if(m.to===self&&this.snap.view?.id===peer)setTimeout(()=>{if(this.snap.view?.id===peer)this.set({cue:text})},300)}
  else if(m.t==='state'){
   // Controls kept for the host: what a guest sends is not followed (an older version does not
   // know and sends anyway); that guest is put back on the group's position.
   if(host&&this.snap.lock&&from.id!==this.snap.cast){const st=this.snap.state,now=Date.now();if(st)from.send({t:'state',s:{...st,time:posNow(st,{hostNow:now,recvAt:this.snap.stateAt,now}),at:now,why:'lock'}});return}
   const prev=this.snap.state,prevAt=this.snap.stateAt,s=m.s
   this.set({state:s,stateAt:Date.now()});this.onRemoteState?.(s)
   const kind=describeChange(prev,s,{hostNow:this.hostNow(),recvAt:prevAt,now:Date.now()});if(kind)this.act(kind,s)
   if(host)this.relay(m,from)}
 }
 private relay(m:Msg,from:Conn){for(const c of this.conns)if(c!==from)c.send(m)}
 private broadcast(m:Msg){for(const c of this.conns)c.send(m)}
 // To one person: straight from the host, through the host from a guest.
 private direct(m:Msg&{to:string}){if(this.snap.role==='host')this.conns.find(c=>c.id===m.to)?.send(m);else this.conns[0]?.send(m)}
 say(text:string){const x=text.trim().slice(0,500);if(!x||this.snap.status!=='ready')return;const m:Msg={t:'chat',name:this.me(),text:x,at:Date.now()};this.addChat({name:m.name,text:x,at:m.at,mine:true});this.typedAt=0;this.broadcast(m)}
 /** May this person drive the video for everyone? (the host can keep the controls) */
 canControl(){return this.snap.role==='host'||!this.snap.lock||this.snap.cast===this.snap.selfId}
 share(s:Omit<PartyState,'by'>){if(this.snap.status!=='ready')return;const at=this.hostNow(),rest:any={...s};delete rest.at;delete rest.byId;const st:PartyState={...rest,by:this.me(),byId:this.snap.selfId,...(at!=null?{at}:{})};this.set({state:st,stateAt:Date.now()});this.broadcast({t:'state',s:st})}
 seen(){if(this.snap.unread)this.set({unread:0})}
 // ---- Who did what ("Ali paused"): a line over the video, and in the chat ----
 private toastSubs=new Set<(text:string,inChat:boolean)=>void>()
 onToast(f:(text:string,inChat:boolean)=>void){this.toastSubs.add(f);return()=>{this.toastSubs.delete(f)}}
 /** A short line over the video, on this PC only (inChat: the same line is also added to the chat). */
 toast(text:string,inChat=false){for(const f of this.toastSubs)f(text,inChat)}
 private act(kind:Action,s:PartyState){
  const name=String(s.by||t('Guest')).slice(0,30),m=s.media
  const text=kind==='play'?t('{name} resumed playback',{name}):kind==='pause'?t('{name} paused',{name}):kind==='seek'?t('{name} jumped to {time}',{name,time:clockTime(s.time)}):kind==='rate'?t('{name} set the speed to {rate}×',{name,rate:String(s.rate||1)}):kind==='episode'&&m?t('{name} started {title}',{name,title:m.kind==='movie'||!s.episodeName?m.name:s.episodeName}):''
  if(!text)return
  this.toast(text,true)
  // In the chat too; the same thing several times in a row from the same person (dragging the bar) leaves one line.
  const last=this.snap.chat[this.snap.chat.length-1],now=Date.now(),act=kind+':'+name,line:Chat={name:'',text,at:now,system:true,act}
  this.set({chat:(last?.act===act&&now-last.at<4000?[...this.snap.chat.slice(0,-1),line]:[...this.snap.chat,line]).slice(-200)})
 }
 // ---- What everyone's player is doing (next to each name) ----
 private mine:Presence|null=null
 private theirs=new Map<string,Presence>()
 /** The player of this window says what it is doing (WatchPartyBridge, once a second). */
 reportPresence(p:{ep:string,pos:number,playing:boolean,buf:boolean,can:boolean}){if(this.snap.status!=='ready')return;this.mine={...p,view:this.snap.view?.id||'',rtt:this.snap.role==='host'?0:this.clock.rtt(),at:this.hostNow()??Date.now()}}
 private presenceTick(){
  if(this.snap.status!=='ready'||!this.mine)return
  if(this.snap.role==='guest'){if(this.snap.v2)this.conns[0]?.send({t:'me',p:this.mine});return}
  const list=[{id:this.snap.selfId,...this.mine},...this.conns.filter(c=>this.theirs.has(c.id)).map(c=>({id:c.id,...this.theirs.get(c.id)!}))]
  const map:Record<string,Presence>={};for(const x of list)map[x.id]=x
  this.set({presence:map});if(this.conns.length)this.broadcast({t:'presence',list});this.retryView();this.pruneViewers()}
 // "Sara is writing…": said at most every 2 s while typing, forgotten after 4 s.
 private typingAt=new Map<string,{name:string,until:number}>()
 private typedAt=0
 typing(){const now=Date.now();if(this.snap.status!=='ready'||now-this.typedAt<2000)return;this.typedAt=now;this.broadcast({t:'typing',id:this.snap.selfId,name:this.me()})}
 private pushTyping(){this.set({typing:[...this.typingAt].map(([id,x])=>({id,name:x.name}))})}
 private forgetTyping(now:number){let gone=false;for(const[id,x]of this.typingAt)if(x.until<now){this.typingAt.delete(id);gone=true}if(gone)this.pushTyping()}
 // ---- Options of the party (the host's) ----
 setLock(on:boolean){if(this.snap.role!=='host')return;lsSet('partyLock',on?'1':'0');this.set({lock:on});this.sendOpts();this.system(on?t('Only the host controls the playback now.'):t('Everyone can control the playback again.'))}
 private sendOpts(){if(this.snap.role==='host')this.broadcast({t:'opts',lock:this.snap.lock,cast:this.snap.cast})}
 /** "3, 2, 1": everyone sees the countdown; whoever started it starts the video at zero. */
 countdown(sec=3){const now=this.hostNow();if(this.snap.status!=='ready'||now==null||!this.canControl())return;const m={t:'count' as const,at:now+sec*1000,name:this.me()};this.set({count:{at:m.at,name:m.name}});this.broadcast(m);for(const f of this.countSubs)f(m.at)}
 private countSubs=new Set<(at:number)=>void>()
 /** Called on the PC that started a countdown (it is the one that starts the video at zero). */
 onMyCount(f:(at:number)=>void){this.countSubs.add(f);return()=>{this.countSubs.delete(f)}}
 // ---- Stream: someone who has the video sends its picture and sound to those who ask ----
 // Asked by the viewer ("ask"), answered by a call (kind "stream") or by a reason ("no").
 // "Cast": one person sends to everyone; the others then watch that stream by themselves.
 private source=new StreamSource()
 private streamOut=new Map<string,Call>()
 private streamIn:Call|null=null
 private wantView=''
 private viewAsked=0
 /** This person prefers their own sources to the stream sent to everyone. */
 ownSources=false
 private quality(){return streamQuality(lsGet('partyQuality')||'',this.streamOut.size)}
 /** The quality of what I send changed (options), or the number of viewers did. */
 retune(){const q=this.quality();for(const c of this.streamOut.values())c.tune(q)}
 private async serve(id:string){
  if(this.snap.status!=='ready'||!id||id===this.snap.selfId)return
  const no=(why:string)=>this.direct({t:'stream',op:'no',to:id,from:this.snap.selfId,why})
  if(lsGet('partyShare')==='0'){no('off');return}
  let st:MediaStream
  try{st=await this.source.start()}catch(e:any){no(/^(novideo|capture)$/.test(String(e?.message))?String(e.message):'capture');if(!this.streamOut.size)this.source.stop();return}
  if(this.snap.status!=='ready'||!this.transport||!this.snap.members.some(x=>x.id===id)){if(!this.streamOut.size)this.source.stop();return}
  const old=this.streamOut.get(id);if(old){this.streamOut.delete(id);try{old.close()}catch{}}
  const c=this.transport.call(id,st,'stream');this.streamOut.set(id,c)
  c.onClose(()=>{if(this.streamOut.get(id)===c)this.stopServing(id)})
  this.source.onChange=()=>{const s=this.source.stream();for(const k of this.streamOut.values())k.replace(s);this.retune()}
  this.source.onCue=text=>{for(const k of this.streamOut.keys())this.direct({t:'cue',to:k,from:this.snap.selfId,text})}
  if(this.source.cue())this.direct({t:'cue',to:id,from:this.snap.selfId,text:this.source.cue()}) // the line on screen right now, for the newcomer
  this.set({viewers:[...this.streamOut.keys()]});this.retune()
  if(!old)this.system(t('{name} is watching your stream.',{name:this.nameOf(id)}))
  // Some videos give no picture to a call (unusual colour formats): after a moment
  // without any picture sent, the picture is redrawn instead (works for every video).
  setTimeout(async()=>{if(this.streamOut.get(id)!==c)return;const s=await c.stats();if(this.streamOut.get(id)===c&&s&&s.outFrames===0)this.source.redraw()},3500)
 }
 private stopServing(id?:string){
  const ids=id?[id]:[...this.streamOut.keys()];let n=0
  for(const k of ids){const c=this.streamOut.get(k);if(!c)continue;this.streamOut.delete(k);n++;try{c.close()}catch{}}
  if(!this.streamOut.size)this.source.stop()
  if(n){this.set({viewers:[...this.streamOut.keys()]});this.retune()}
 }
 /** Watch the stream of someone who has the video. */
 watch(id:string){
  if(this.snap.status!=='ready'||!id||id===this.snap.selfId)return
  if(this.snap.view?.id===id&&this.snap.view.state!=='error')return
  this.dropView();this.wantView=id
  this.set({view:{id,state:'asking',error:'',why:'',stream:null},cue:''});this.ask(id)
 }
 private ask(id:string){
  const asked=this.viewAsked=Date.now();this.direct({t:'stream',op:'ask',to:id,from:this.snap.selfId})
  setTimeout(()=>{if(this.viewAsked===asked&&this.snap.view?.id===id&&this.snap.view.state==='asking')this.viewFailed('timeout')},15000)
 }
 /** Stop watching a stream (quiet: the sender already knows, or is gone). */
 unwatch(quiet=false){const v=this.snap.view;this.wantView='';if(!v)return;if(!quiet)this.direct({t:'stream',op:'stop',to:v.id,from:this.snap.selfId});this.dropView()}
 private dropView(){this.viewAsked=0;const c=this.streamIn;this.streamIn=null;if(c){try{c.close()}catch{}}if(this.snap.view)this.set({view:null,cue:''})}
 private viewFailed(why:string){
  const v=this.snap.view;if(!v)return;const name=this.nameOf(v.id)
  const error=why==='off'?t('{name} does not share their video.',{name}):why==='novideo'?t('{name} has no video playing yet.',{name}):why==='timeout'?t('No answer from {name}. They may need to update NovelReader.',{name}):t('The video of {name} cannot be sent from their device.',{name})
  this.viewAsked=0;const c=this.streamIn;this.streamIn=null;if(c){try{c.close()}catch{}}
  this.set({view:{...v,state:'error',error,why,stream:null},cue:''})
 }
 // The sender had no video yet: ask again once it has one (they open the episode a moment later).
 private retryView(){const v=this.snap.view;if(v&&v.state==='error'&&v.why==='novideo'&&this.snap.presence[v.id]?.can){this.set({view:{...v,state:'asking',error:'',why:''}});this.ask(v.id)}}
 private streamIncoming(c:Call){
  const v=this.snap.view;if(!v||v.id!==c.peer){c.close();return}
  const old=this.streamIn;this.streamIn=c;this.viewAsked=0;if(old){try{old.close()}catch{}}
  c.answer(new MediaStream());c.smooth(250)
  c.onStream(st=>{c.smooth(250);const cur=this.snap.view;if(this.streamIn===c&&cur)this.set({view:{...cur,state:'on',error:'',why:'',stream:st}})})
  // The call dropped but the sender is still there (its player reloaded, a network hiccup): ask again.
  c.onClose(()=>{if(this.streamIn!==c)return;this.streamIn=null;const cur=this.snap.view;if(!cur)return;this.set({view:{...cur,state:'asking',stream:null},cue:''});setTimeout(()=>{const now=this.snap.view;if(now&&now.id===cur.id&&now.state==='asking'&&!this.streamIn&&this.snap.status==='ready')this.ask(cur.id)},1500)})
 }
 /** What arrives from the stream being watched (height of the picture, pictures a second). */
 viewStats(){return this.streamIn?this.streamIn.stats():Promise.resolve(null)}
 /** Send my video to everyone (the others watch it instead of opening the episode). */
 castStart(){if(this.snap.status!=='ready'||this.snap.cast===this.snap.selfId)return;if(this.snap.role==='host')this.hostCast(this.snap.selfId);else this.conns[0]?.send({t:'cast',on:true})}
 castStop(){if(this.snap.cast!==this.snap.selfId)return;if(this.snap.role==='host')this.hostCast('');else this.conns[0]?.send({t:'cast',on:false})}
 private hostCast(id:string){if(this.snap.role!=='host'||id===this.snap.cast)return;this.system(id?t('{name} is sending their video to everyone.',{name:this.nameOf(id)}):t('The stream for everyone ended.'));this.applyCast(id);this.sendOpts()}
 // What a change of "who sends to everyone" means here: watch it, or go back to my own player.
 private applyCast(id:string){
  const was=this.snap.cast;if(was===id)return
  this.set({cast:id})
  if(id&&id!==this.snap.selfId){if(!this.ownSources)this.watch(id)}
  // It ended (stopped, or that person left): whoever followed it goes back to their own player.
  else if(was&&was!==this.snap.selfId){if(this.snap.view?.id===was)this.unwatch(true);if(!this.ownSources&&this.snap.state?.media)window.dispatchEvent(new Event('nr-party-reopen'))}
  if(id===this.snap.selfId&&this.snap.view)this.unwatch()
  if(was===this.snap.selfId)this.stopServing() // my video is no longer for everyone: nobody is sent it any more
  if(!id)this.ownSources=false // (the next stream for everyone opens by itself again)
 }
 // Someone who no longer watches my video (they closed it without a word, or their link
 // dropped) is not sent to any more: their status says what they watch, every 2 s.
 private gone=new Map<string,number>()
 private pruneViewers(){for(const id of [...this.streamOut.keys()]){const p=this.snap.presence[id];if(p&&p.view!==this.snap.selfId){const n=(this.gone.get(id)||0)+1;this.gone.set(id,n);if(n>=3){this.gone.delete(id);this.stopServing(id)}}else this.gone.delete(id)}}
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
  try{this.local=await navigator.mediaDevices.getUserMedia({audio:this.micWish(),video:false})}
  catch(e:any){this.set({voice:'off',voiceError:/NotAllowed|Permission/i.test(String(e?.name||e))?(onPhone()?t('The microphone is not allowed. Allow it for NovelReader in the settings of the phone (Apps › NovelReader › Permissions).'):t('The microphone is not allowed. Check Windows Settings › Privacy › Microphone.')):/NotFound/i.test(String(e?.name||e))?t('No microphone found.'):String(e?.message||e)});return}
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
  c.onStream(st=>{const a=entry.audio||document.createElement('audio');a.autoplay=true;a.dataset.wpVoice=c.peer;a.srcObject=st;a.volume=voiceVolume()*this.personVolume(c.peer);if(!entry.audio){a.style.display='none';document.body.appendChild(a)}entry.audio=a;a.play().catch(()=>{});this.listen(c.peer,st)})
  c.onClose(()=>{if(this.calls.get(c.peer)===entry)this.hangUp(c.peer)})
 }
 private hangUp(id:string){const e=this.calls.get(id);if(!e)return;this.calls.delete(id);try{e.call.close()}catch{}e.audio?.remove();this.levels.delete(id)}
 private applyMic(){if(!this.local)return;const on=!this.snap.muted&&(!this.snap.ptt||this.snap.talking);for(const tr of this.local.getAudioTracks())tr.enabled=on}
 setMuted(muted:boolean){if(!this.local)return;this.set({muted});this.applyMic();this.voiceMsg()}
 // Push to talk: the microphone is on only while the V key is held.
 setPtt(on:boolean){lsSet('partyPtt',on?'1':'0');this.set({ptt:on,talking:false});this.applyMic()}
 setTalking(on:boolean){if(!this.snap.ptt||this.snap.talking===on)return;this.set({talking:on});this.applyMic()}
 setVolume(v:number){lsSet('partyVoiceVolume',String(v));for(const[id,e]of this.calls)if(e.audio)e.audio.volume=v*this.personVolume(id)}
 // Each person's voice has its own volume on this PC (kept by name, for the next parties too).
 private volumes():Record<string,number>{try{const o=JSON.parse(lsGet('partyVolumes')||'{}');return o&&typeof o==='object'?o:{}}catch{return{}}}
 personVolume(id:string){const v=Number(this.volumes()[this.nameOf(id)]);return Number.isFinite(v)?Math.min(1,Math.max(0,v)):1}
 setPersonVolume(id:string,v:number){const all=this.volumes();all[this.nameOf(id)]=Math.min(1,Math.max(0,v));lsSet('partyVolumes',JSON.stringify(all));const e=this.calls.get(id);if(e?.audio)e.audio.volume=voiceVolume()*this.personVolume(id)}
 // Which microphone: the one chosen in the options (kept), else the system's.
 private micWish():MediaTrackConstraints{const id=lsGet('partyMic')||'';return{echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(id?{deviceId:{ideal:id}}:{})}}
 /** Another microphone: used at once when in the voice channel (the calls go on). */
 async setMic(deviceId:string){
  lsSet('partyMic',deviceId);if(this.snap.voice!=='on')return
  try{const st=await navigator.mediaDevices.getUserMedia({audio:this.micWish(),video:false});if(this.snap.voice!=='on'){st.getTracks().forEach(tr=>tr.stop());return}
   const old=this.local;this.local=st;this.applyMic();for(const e of this.calls.values())e.call.replace(st);old?.getTracks().forEach(tr=>tr.stop());this.listen(this.snap.selfId,st);this.set({voiceError:''})}
  catch(e:any){this.set({voiceError:String(e?.message||e)})}}
 voiceLeave(silent=false){for(const id of [...this.calls.keys()])this.hangUp(id);this.local?.getTracks().forEach(tr=>tr.stop());this.local=null;clearInterval(this.meter);this.meter=null;this.levels.clear();const was=this.snap.voice==='on';this.set({voice:'off',muted:false,speaking:[]});if(was&&!silent){this.system(t('You left the voice channel.'));this.voiceMsg()}}
 // ---- Cameras (small bubbles over the video) ----
 // Off by default. Whoever turns their camera on sends it to every other person
 // (video only, small and capped); the others only receive.
 private camOut=new Map<string,Call>()
 private camIn=new Map<string,Call>()
 private route(c:Call){if(c.kind==='cam')this.camIncoming(c);else if(c.kind==='stream')this.streamIncoming(c);else this.incoming(c)}
 async camStart(){
  if(this.snap.status!=='ready'||this.snap.cam!=='off')return
  this.set({cam:'starting',camError:''})
  let st:MediaStream
  try{st=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:320},height:{ideal:240},frameRate:{ideal:15,max:15}},audio:false})}
  catch(e:any){const n=String(e?.name||e);this.set({cam:'off',camError:/NotAllowed|Permission/i.test(n)?(onPhone()?t('The camera is not allowed. Allow it for NovelReader in the settings of the phone (Apps › NovelReader › Permissions).'):t('The camera is not allowed. Check Windows Settings › Privacy › Camera.')):/NotFound|Overconstrained/i.test(n)?t('No camera found.'):/NotReadable|TrackStart/i.test(n)?t('The camera is used by another app.'):String(e?.message||e)});return}
  this.set({cam:'on',camLocal:st});this.voiceMsg();this.syncCams()
 }
 camStop(silent=false){for(const c of this.camOut.values()){try{c.close()}catch{}}this.camOut.clear();this.camTry.clear();this.snap.camLocal?.getTracks().forEach(tr=>tr.stop());const was=this.snap.cam==='on';this.set({cam:'off',camLocal:null});if(was&&!silent)this.voiceMsg()}
 private syncCams(){
  const self=this.snap.selfId;if(!this.transport)return
  const ids=new Set(this.snap.members.filter(m=>m.id!==self).map(m=>m.id))
  // Mine to everyone (newcomers included).
  if(this.snap.cam==='on'&&this.snap.camLocal){for(const id of ids)if(!this.camOut.has(id)){const n=this.camTry.get(id)||0;const c=this.transport.call(id,this.snap.camLocal,'cam',n?CAM_CODECS[(n-1)%CAM_CODECS.length]:'');this.camOut.set(id,c);c.limit(250000);c.onClose(()=>{if(this.camOut.get(id)===c)this.camOut.delete(id)});this.watchCamOut(id,c)}}
  for(const[id,c]of[...this.camOut])if(!ids.has(id)){try{c.close()}catch{}this.camOut.delete(id);this.camTry.delete(id)}
  // Theirs: dropped when they turn it off or leave.
  const on=new Set(this.snap.members.filter(m=>m.cam).map(m=>m.id))
  for(const[id,c]of[...this.camIn])if(!on.has(id)){try{c.close()}catch{}this.dropCam(id)}
 }
 // (The new call takes the place first: the bubble stays while the old call closes.)
 private camIncoming(c:Call){const old=this.camIn.get(c.peer);this.camIn.set(c.peer,c);if(old){try{old.close()}catch{}}c.answer(new MediaStream());c.onStream(st=>{const was=this.snap.cams.find(x=>x.id===c.peer);this.set({cams:[...this.snap.cams.filter(x=>x.id!==c.peer),{id:c.peer,stream:st,live:false}]});if(!was||was.stream!==st)this.watchCamIn(c)});c.onClose(()=>{if(this.camIn.get(c.peer)===c)this.dropCam(c.peer)})}
 // ---- A camera that connects but shows nothing (black) ----
 // The viewer checks that pictures really arrive. If none after a few seconds, it
 // asks the sender to call again, which then uses another video format (VP8, H264,
 // VP9 in turn): a black picture usually comes from one PC's encoder or decoder for
 // one format. The sender also checks by itself that its pictures leave. Three tries.
 private camTry=new Map<string,number>()
 private camAsked=new Map<string,number>()
 private watchCamIn(c:Call){
  const id=c.peer;let checks=0
  const tick=async()=>{
   if(this.camIn.get(id)!==c)return
   const st=await c.stats();if(this.camIn.get(id)!==c)return
   if(st&&st.inFrames>0){this.camAsked.delete(id);if(this.snap.cams.some(x=>x.id===id&&!x.live))this.set({cams:this.snap.cams.map(x=>x.id===id?{...x,live:true}:x)});return}
   // Still nothing: ask once for this call, then keep looking (the picture may come late).
   if(++checks===CAM_CHECKS){const n=(this.camAsked.get(id)||0)+1;if(n<=3){this.camAsked.set(id,n);const m:Msg={t:'camfix',to:id,from:this.snap.selfId,n};for(const k of this.conns)k.send(m)}}
   setTimeout(tick,checks<CAM_CHECKS?CAM_WAIT/CAM_CHECKS:3000)}
  setTimeout(tick,CAM_WAIT/CAM_CHECKS)}
 private watchCamOut(id:string,c:Call){
  setTimeout(async()=>{if(this.camOut.get(id)!==c)return;const st=await c.stats();if(this.camOut.get(id)!==c||!st)return
   if(st.outFrames===0&&(this.camTry.get(id)||0)<3)this.camAgain(id,(this.camTry.get(id)||0)+1)},CAM_WAIT+2000)}
 private camAgain(id:string,n:number){const c=this.camOut.get(id);if(c){this.camOut.delete(id);try{c.close()}catch{}}this.camTry.set(id,Math.min(n,3));setTimeout(()=>this.syncCams(),400)}
 private dropCam(id:string){this.camIn.delete(id);if(this.snap.cams.some(x=>x.id===id))this.set({cams:this.snap.cams.filter(x=>x.id!==id)})}
 // Who is speaking: audio level of each voice (and mine), checked 6 times a second.
 private ctx:AudioContext|null=null
 private levels=new Map<string,AnalyserNode>()
 private listen(id:string,st:MediaStream){try{this.ctx=this.ctx||new AudioContext();const src=this.ctx.createMediaStreamSource(st),an=this.ctx.createAnalyser();an.fftSize=512;src.connect(an);this.levels.set(id,an)}catch{}}
 private startMeter(){if(this.local)this.listen(this.transport?.selfId()||'me',this.local);const buf=new Uint8Array(512);this.meter=setInterval(()=>{const on:string[]=[];for(const[id,an]of this.levels){an.getByteTimeDomainData(buf);let peak=0;for(const v of buf)peak=Math.max(peak,Math.abs(v-128));if(peak>12&&!(id===this.snap.selfId&&(this.snap.muted||(this.snap.ptt&&!this.snap.talking))))on.push(id)}const cur=this.snap.speaking;if(on.length!==cur.length||on.some(x=>!cur.includes(x)))this.set({speaking:on})},160)}
 leave(error='',quiet=false){this.recovering=false;if(this.snap.role==='host'&&!error&&!quiet)for(const c of this.conns)c.send({t:'bye',end:true});this.closeLinks();this.ownSources=false;this.wantView='';this.set({role:'',status:error?'error':'idle',error,members:[],state:null,code:'',selfId:'',waiting:[],missing:null,missingState:'',missingError:'',reconnecting:false,...FRESH})}
}
// ---- Video sources of this PC (to tell if the party's source is installed) ------
const listOf=(d:any,...k:string[])=>Array.isArray(d)?d:(k.map(x=>d?.[x]).find(Array.isArray)||[])
let srcCache:{at:number,map:Map<string,{pkg:string,name:string}>}|null=null
export async function videoSources(force=false){
 if(!force&&srcCache&&Date.now()-srcCache.at<60000)return srcCache.map
 const d=await engineFetch('/api/v1/sources')
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
// The link of an invitation: a small web page that opens NovelReader on the party (or, without it, the app's own link).
export async function inviteLink(code:string){const base=await (window.novelReader as any).inviteBase?.().catch(()=>'')||'';return base?base+code:'novelreader://party/'+code}
export async function inviteText(code:string){const link=await inviteLink(code);return t('Join my NovelReader watch party: {link} (code {code})',{link,code})}
export const voiceVolume=()=>{const v=Number(lsGet('partyVoiceVolume'));return isFinite(v)&&lsGet('partyVoiceVolume')!==null?Math.min(1,Math.max(0,v)):1}
export const party=new Party()
if((window as any).__partyFake||(window as any).__partyHook)(window as any).__nrParty=party // tests only (the second: over the real server)
export function useParty(){const[,bump]=useState(0);useEffect(()=>party.subscribe(()=>bump(x=>x+1)),[]);return party.snap}

// ---- Bridge: follows the player of this window ---------------------------------
// current(): what this window is playing; open(): show the same title/episode.
export function WatchPartyBridge({current,open}:{current:()=>PartyOpen|null,open:(o:PartyOpen)=>void}){
 const snap=useParty(),curRef=useRef(current),openRef=useRef(open);curRef.current=current;openRef.current=open
 const enforce=useRef<{until:number,s:PartyState|null}>({until:0,s:null}),quietUntil=useRef(0),pending=useRef<PartyState|null>(null),pendingAt=useRef(0),lastEp=useRef(''),seq=useRef(0)
 const active=snap.status==='ready'
 // Who gives the tempo: the person who streams their video to everyone; else the first person
 // (the host first) who has the party's video playing on their own player. A host who
 // watches a friend's stream has no video of its own: the friend leads. (With the controls
 // kept for the host, only the host does.)
 const leaderOf=()=>{const s=party.snap;if(s.cast)return s.cast;if(s.lock)return s.members[0]?.id||'';const key=epKey(s.state);return(key&&s.members.find(m=>{const p=s.presence[m.id];return!!p&&p.ep===key&&!p.view})?.id)||s.members[0]?.id||''}
 const leads=()=>leaderOf()===party.snap.selfId
 const sameEp=(s:PartyState)=>{const c=curRef.current();return!!c&&!!s.media&&c.media.sourceId===s.media.sourceId&&c.media.url===s.media.url&&c.episodeUrl===s.episodeUrl}
 const video=()=>document.querySelector('.media-player-top video') as HTMLVideoElement|null
 // Changes made here on behalf of someone else are not sent back (expected events are consumed).
 const expect_=useRef<{seek:number|null,play:number,pause:number,rate:number}>({seek:null,play:0,pause:0,rate:0})
 // Where the group is now. With a position that carries its time and a clock in step with
 // the host's it is exact; otherwise it is guessed from when the message arrived.
 const groupPos=(s:PartyState,recvAt:number)=>posNow(s,{hostNow:party.hostNow(),recvAt,now:Date.now()})
 // Small gaps are closed by the speed (a few percent, for a few seconds) instead of a jump.
 // on: this player is adjusting; base: the speed chosen for the group; set/at: the last speed put here and when.
 const nudge=useRef({on:false,base:1,set:0,at:0}),appliedAt=useRef(0),jumpAt=useRef(0)
 const setSpeed=(v:HTMLVideoElement,rate:number)=>{if(Math.abs(v.playbackRate-rate)<0.0005)return;nudge.current.set=rate;nudge.current.at=Date.now();v.playbackRate=rate;for(const a of Array.from(v.closest('.remote-player')?.querySelectorAll('audio')||[]))(a as HTMLAudioElement).playbackRate=rate}
 const stopNudge=(v:HTMLVideoElement|null)=>{const n=nudge.current;if(!n.on)return;n.on=false;if(v&&Math.abs(v.playbackRate-n.set)<0.0005)setSpeed(v,n.base)}
 const apply=(s:PartyState,recvAt=Date.now())=>{const v=video();if(!v||!sameEp(s))return false;const ex=expect_.current
  const exact=s.at!=null&&party.hostNow()!=null,target=groupPos(s,recvAt)
  // Exact: a playing video only jumps when it is far (the speed closes the rest), a paused one lands on the same picture.
  if(Math.abs(v.currentTime-target)>(exact?(s.playing?DRIFT.hard:0.05):1.5)){ex.seek=target;v.currentTime=target}
  const mine=nudge.current.on?nudge.current.base:v.playbackRate
  if(s.rate&&mine!==s.rate){stopNudge(null);ex.rate++;v.playbackRate=s.rate}
  appliedAt.current=Date.now()
  if(s.playing&&v.paused){ex.play++;v.play().catch(()=>{ex.play=Math.max(0,ex.play-1)})}if(!s.playing&&!v.paused){ex.pause++;v.pause()}
  enforce.current={until:Date.now()+3000,s} // the player may start playing by itself right after loading
  return true}
 useEffect(()=>{
  party.onRemoteState=s=>{if(!s.media)return;seq.current++
   // Watching someone's stream: nothing to open or to move here, the picture comes from them.
   if(party.snap.view){pending.current=null;return}
   if(sameEp(s)){const v=video();if(v&&v.readyState>=1&&apply(s))pending.current=null;else{pending.current=s;pendingAt.current=Date.now()}return}
   pending.current=s;pendingAt.current=Date.now();quietUntil.current=Date.now()+15000;lastEp.current=s.media.sourceId+'|'+s.media.url+'|'+s.episodeUrl;openRef.current({media:s.media,episodeUrl:s.episodeUrl,episodeName:s.episodeName,episodeNumber:s.episodeNumber})}
  return()=>{party.onRemoteState=null}
 },[])
 useEffect(()=>{if(!active)return
  let attached:HTMLVideoElement|null=null,hb:any=0
  let lockSaid=0
  const send=(e?:Event,reason='')=>{const v=attached,c=curRef.current();if(!v||!c)return;const ex=expect_.current,type=e?.type
   if(type==='seeked'&&ex.seek!=null&&Math.abs(v.currentTime-ex.seek)<0.6){ex.seek=null;return}
   if(type==='play'&&ex.play>0){ex.play--;return}
   // The player can restart playback by itself (stall recovery, autoplay): without a
   // click or key press, keep the group's pause instead of un-pausing everyone.
   if(type==='play'&&Date.now()-lastInput>1000){const st=party.snap.state;if(st&&!st.playing&&sameEp(st)){ex.pause++;v.pause();return}}
   if(type==='pause'&&ex.pause>0){ex.pause--;return}
   if(type==='ratechange'&&ex.rate>0){ex.rate--;return}
   // A speed put here to close a gap is not a choice of speed for the group.
   if(type==='ratechange'&&Math.abs(v.playbackRate-nudge.current.set)<0.0005&&Date.now()-nudge.current.at<1500)return
   if(Date.now()<quietUntil.current)return
   if(v.dataset.casting)return // playing on a TV: the paused PC video is not a group action
   if(party.snap.view)return // watching someone's stream: this player is set aside meanwhile
   // A video that just loaded jumps to its own saved position and may start by itself: not a user action.
   if(e&&(!settled||Date.now()<settled)&&Date.now()-attachAt<4000)return
   // The player went back to the start by itself (stream reloaded, server switched after
   // a stall, HLS recovery): never send that to everyone. Put this player back on the
   // group's position instead. A restart chosen by hand (click, key) is still shared.
   const st=party.snap.state
   if(st&&sameEp(st)&&Date.now()-lastInput>1500){const groupT=groupPos(st,party.snap.stateAt||Date.now())
    if(groupT>10&&v.currentTime<Math.min(5,groupT-8)){if(!pending.current){pending.current=st;pendingAt.current=party.snap.stateAt||Date.now()}return}}
   // The host keeps the controls: what was done here is undone (back on the group's position), not sent.
   if(!party.canControl()){if(e){if(st&&sameEp(st)&&!pending.current){pending.current=st;pendingAt.current=party.snap.stateAt||Date.now()}if(Date.now()-lockSaid>4000){lockSaid=Date.now();party.toast(t('Only the host controls the playback.'))}}return}
   const why=reason||(type==='play'?'play':type==='pause'?'pause':type==='seeked'?'seek':type==='ratechange'?'rate':'episode')
   // What is done here by hand wins over "keep the group's pause for 3 s" (set when someone else paused):
   // pressing play right after a friend's pause used to be undone on this PC only.
   if(e)enforce.current={until:0,s:null}
   party.share({media:c.media,episodeUrl:c.episodeUrl,episodeName:c.episodeName,episodeNumber:c.episodeNumber,playing:!v.paused,time:v.currentTime,rate:nudge.current.on?nudge.current.base:v.playbackRate,why,...(Number.isFinite(v.duration)?{dur:v.duration}:{})})}
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
   const c=curRef.current()
   // What this player is doing, for the others (shown next to my name).
   // (An episode page without a video yet, e.g. a source this PC does not have, is "no video".)
   party.reportPresence({ep:c&&v?c.media.sourceId+'|'+c.media.url+'|'+c.episodeUrl:'',pos:v?v.currentTime:0,playing:!!v&&!v.paused,buf:!!v&&!v.paused&&!v.seeking&&v.readyState<3,can:!!c&&lsGet('partyShare')!=='0'&&canStream()})
   if(!v||!c){nudge.current.on=false;return}
   // Watching someone's stream: a player that starts by itself underneath (an episode found in another source) would talk over it.
   if(party.snap.view){if(!v.paused)v.pause();return}
   const en=enforce.current;if(en.s&&Date.now()<en.until&&sameEp(en.s)){const ex=expect_.current;if(!en.s.playing&&!v.paused){ex.pause++;v.pause()}}
   const key=c.media.sourceId+'|'+c.media.url+'|'+c.episodeUrl
   // Following someone: wait for the video, then apply their state, and once more a
   // moment later (the player may jump to its own saved position meanwhile).
   if(pending.current&&sameEp(pending.current)&&v.readyState>=1){const p=pending.current,at=pendingAt.current;if(apply(p,at)){pending.current=null;quietUntil.current=0;const mine=seq.current;setTimeout(()=>{if(seq.current!==mine)return;apply(p,at)},1500)}}
   else if(key!==lastEp.current&&!pending.current){lastEp.current=key;send()} // a new episode chosen here
   // Staying in step. Whoever gives the tempo (the host, or the person who streams to everyone)
   // plays normally; the others, once their clock is in step with the host's, close a small
   // gap by playing a few percent faster or slower, and jump when they are far.
   const st=party.snap.state,now=Date.now(),n=nudge.current
   const follows=!leads()&&!!st&&st.at!=null&&party.hostNow()!=null&&sameEp(st)&&st.playing&&!pending.current&&!v.paused&&!v.seeking&&!v.ended&&v.readyState>=3&&now>=quietUntil.current&&!v.dataset.casting&&now-appliedAt.current>700
   if(!follows){stopNudge(v);return}
   const target=groupPos(st!,party.snap.stateAt),fix=driftFix(target-v.currentTime,n.on)
   if(fix.jump){stopNudge(v);expect_.current.seek=target;jumpAt.current=now;v.currentTime=target;appliedAt.current=now}
   else if(fix.factor===1)stopNudge(v)
   else{n.on=true;n.base=st!.rate||1;setSpeed(v,+(n.base*fix.factor).toFixed(4))}
  },400)
  // The tempo: whoever leads says where it is every 5 s while playing.
  hb=setInterval(()=>{if(leads()&&attached&&!attached.paused&&!attached.seeking&&attached.readyState>=3&&!pending.current&&Date.now()>=quietUntil.current)send(undefined,'hb')},5000)
  return()=>{clearInterval(iv);clearInterval(hb);stopNudge(attached);attached?.removeEventListener('canplay',onCanPlay);window.removeEventListener('pointerdown',onInput,true);window.removeEventListener('keydown',onInput,true);window.removeEventListener('nr-user-input',onInput);window.removeEventListener('nr-player-reload',onReload);for(const e of evs)attached?.removeEventListener(e,send)}
 },[active])
 useEffect(()=>{if(active)videoSources().catch(()=>{})},[active])
 // Back from someone's stream with the same episode open here: this player rejoins the group.
 const viewing=!!snap.view
 useEffect(()=>{if(!active||viewing)return;const st=party.snap.state;if(st&&sameEp(st)&&video()){pending.current=st;pendingAt.current=party.snap.stateAt||Date.now()}},[viewing])
 // "3, 2, 1" started here: pause now, and start at zero (the others follow like any play).
 useEffect(()=>{if(!active)return;return party.onMyCount(at=>{const v=video();if(!v||party.snap.view)return;window.dispatchEvent(new Event('nr-user-input'));if(!v.paused)v.pause()
  setTimeout(()=>{const vv=video();if(!vv||party.snap.status!=='ready'||party.snap.view)return;window.dispatchEvent(new Event('nr-user-input'));vv.play().catch(()=>{})},Math.max(0,at-(party.hostNow()??Date.now())))})},[active])
 // The film gets quieter while someone else speaks in the voice channel.
 const others=snap.voice==='on'&&snap.speaking.some(id=>id!==snap.selfId)
 // (The film is the player of this window, or the stream of a friend.)
 const film=()=>(document.querySelector('.party-theater video')||video()) as HTMLVideoElement|null
 useEffect(()=>{if(snap.voice!=='on'||lsGet('partyDuck')==='0')return
  const v=film();if(!v)return
  if(others){if(!v.dataset.ducked){v.dataset.ducked=String(v.volume);v.volume=v.volume*0.35};return}
  const tm=setTimeout(()=>{for(const vv of Array.from(document.querySelectorAll('video[data-ducked]')) as HTMLVideoElement[]){const back=Number(vv.dataset.ducked);vv.volume=Math.min(1,Math.max(0,isFinite(back)?back:1));delete vv.dataset.ducked}},700)
  return()=>clearTimeout(tm)},[others,snap.voice])
 useEffect(()=>{if(snap.voice==='on')return;for(const v of Array.from(document.querySelectorAll('video[data-ducked]')) as HTMLVideoElement[]){v.volume=Number(v.dataset.ducked)||1;delete v.dataset.ducked}},[snap.voice])
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
  // (A jump made here to catch up with the group is not one of those: a player that stays
  // stuck after it is a slow connection, and the group waits for it.)
  const onSeek=()=>{if(Date.now()-jumpAt.current<400)return;lastSeek=Date.now();since=0}
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
  const shareLocal=(patch:Partial<PartyState>)=>{const st=party.snap.state;if(!st)return;party.share({media:st.media,episodeUrl:st.episodeUrl,episodeName:st.episodeName,episodeNumber:st.episodeNumber,playing:st.playing,time:st.time,rate:st.rate,dur:st.dur,...patch});const now=party.snap.state;if(now)apply(now)}
  const tick=()=>{const now=Date.now(),st=party.snap.state,v=video()
   const w=[...party.buffering.entries()].filter(([id])=>!((skip.get(id)||0)>now))
   if(lsGet('partyWait')==='0'){if(hold){hold=null;shareLocal({playing:true,why:'resume'})}party.setWaiting([]);return}
   if(!hold){
    if(w.length&&st&&st.playing&&v&&sameEp(st)){const groupT=st.time+(now-(party.snap.stateAt||now))/1000*(st.rate||1);const behind=w.map(([,b])=>b.time).filter(x=>x>0&&x<=groupT+1&&x>=groupT-15);hold={time:Math.max(0,Math.min(groupT,...behind)),since:now};shareLocal({playing:false,time:hold.time,why:'wait'});party.setWaiting(names(w))}
    else party.setWaiting([])
    return}
   if(!st||!sameEp(st)){hold=null;party.setWaiting([]);return}
   if(st.playing){hold=null;for(const[id]of w)skip.set(id,now+10000);party.setWaiting([]);return} // someone pressed play: go on
   if(!w.length){const at=hold.time;hold=null;party.setWaiting([]);shareLocal({playing:true,time:at,why:'resume'});return}
   if(now-hold.since>30000){for(const[id]of w)skip.set(id,now+120000);party.note(t('{names} still loading: the party goes on without waiting.',{names:names(w).map(x=>x.name).join(', ')}));const at=hold.time;hold=null;party.setWaiting([]);shareLocal({playing:true,time:at,why:'resume'});return}
   party.setWaiting(names(w))}
  party.onBufferChange=tick;const iv=setInterval(tick,500)
  return()=>{clearInterval(iv);party.onBufferChange=null;party.setWaiting([])}
 },[active,snap.role])
 if(!active)return null
 const meWaited=snap.waiting.some(x=>x.id===snap.selfId)
 if(!snap.waiting.length&&!slowHint)return null
 return <div className="wp-wait" role="status">{snap.waiting.length?<span>⏳ {meWaited&&snap.waiting.length===1?t('Your video is loading, the others are waiting for you…'):t('Waiting for {names}… (video loading)',{names:snap.waiting.map(x=>x.name).join(', ')})}</span>:null}{slowHint&&<span className="wp-wait-hint">{t('Your video keeps loading: choose a lower quality in the Quality menu, or another server.')}</span>}</div>
}
