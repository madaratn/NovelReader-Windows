// Watch party: the picture and the sound of this window's player as a stream that can be
// sent to someone (the "stream" of features/watch-party.tsx).
// - The <video> of the player is captured as it plays: no interface around it, and the
//   film's own sound whatever the volume here.
// - A video that comes from another address can only be captured when it was loaded with
//   permission (crossOrigin). The player reloads it that way when asked ('nr-party-capture'),
//   at the same position.
// - What is sent always has one picture track and one sound track. They are swapped when
//   the player changes video (another episode, another quality), so the call goes on.
// - Some videos give no picture to a call (unusual colour formats): redraw() sends the
//   picture drawn on a canvas instead, which works for every video the player can show.
// - The subtitles shown here are not part of the picture: their text is passed along (onCue).

export const STREAM_QUALITY:Record<string,{bps:number,height:number}>={'1080':{bps:5_000_000,height:1080},'720':{bps:2_800_000,height:720},'480':{bps:1_300_000,height:480}}
/** Ceiling for each viewer: the quality chosen, or by itself 720p for one or two viewers and
 * 480p beyond (each viewer is one more encoding and one more upload for the sender). */
export function streamQuality(choice:string,viewers:number){return STREAM_QUALITY[choice]||(viewers>2?STREAM_QUALITY['480']:STREAM_QUALITY['720'])}

export const playerVideo=()=>document.querySelector('.media-player-top video') as HTMLVideoElement|null
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
const capture=(el:HTMLMediaElement|null):MediaStream|null=>{try{const f=(el as any)?.captureStream;return typeof f==='function'?f.call(el):null}catch{return null}}
const liveTrack=(s:MediaStream|null|undefined,kind:string)=>s?.getTracks().find(x=>x.kind===kind&&x.readyState==='live')||null
/** The text of a subtitle line, without its markup. */
export const cueText=(c:any)=>String(c?.text||'').replace(/<[^>]+>/g,'').replace(/\{\\[^}]*\}/g,'').trim().slice(0,600)
/** A video served by this PC itself (engine, downloads, torrents) answers with the permission a
 * page needs to capture it, so it can be loaded again that way; the phone's engine does not. */
export const capturable=(url:string)=>/^http:\/\/(127\.0\.0\.1|localhost):\d+\//i.test(url)&&!(window as any).Capacitor
/** Can this device send its player at all? (not the phone: see capturable) */
export const canSend=()=>!(window as any).Capacitor&&typeof (HTMLMediaElement.prototype as any).captureStream==='function'
// Tried once per video: capturing it works, or it can be loaded again with the permission.
let probed:{src:string,ok:boolean}|null=null
/** Can the player of this window be sent to someone? (a video is loaded, and it can be captured here) */
export function canStream(){
 const v=playerVideo();if(!v||v.readyState<2||typeof (v as any).captureStream!=='function')return false
 const src=v.currentSrc||v.src||'';if(probed&&probed.src===src)return probed.ok
 const st=capture(v);if(st)for(const tr of st.getTracks())try{tr.stop()}catch{}
 probed={src,ok:!!st||capturable(src)};return probed.ok
}

export class StreamSource{
 private el:HTMLVideoElement|null=null
 private cap:MediaStream|null=null
 private out:MediaStream|null=null
 private timer:any=null
 private ctx:AudioContext|null=null
 private silence:MediaStreamTrack|null=null
 private blank:MediaStreamTrack|null=null
 private canvas:{track:MediaStreamTrack,stop:()=>void}|null=null
 private drawing=false
 private sound:{el:HTMLMediaElement,cap:MediaStream}|null=null
 private lastCue=''
 private heard=new WeakSet<TextTrack>()
 /** The tracks of the stream changed (the calls must send the new ones). */
 onChange:(()=>void)|null=null
 /** The subtitle line shown by the player changed ('' = none). */
 onCue:((text:string)=>void)|null=null
 stream(){return this.out!}
 /** The subtitle line on screen now ('' = none). */
 cue(){return this.lastCue}
 active(){return!!this.out}
 /** The stream to send. Fails with 'novideo' (nothing is playing here) or 'capture'
  * (this video cannot be captured on this device). */
 async start():Promise<MediaStream>{
  if(this.out){this.sync();return this.out}
  let v=playerVideo();if(!v||!(v.currentSrc||v.src||v.srcObject))throw new Error('novideo')
  if(typeof (v as any).captureStream!=='function')throw new Error('capture')
  let cap=capture(v)
  if(!cap){
   // Loaded without permission to capture: the player loads it again with it (same position).
   const ev=new CustomEvent('nr-party-capture',{detail:{ok:false}});window.dispatchEvent(ev)
   if(!ev.detail.ok)throw new Error('capture')
   const until=Date.now()+9000
   while(!cap&&Date.now()<until){await sleep(300);v=playerVideo();if(!v)throw new Error('novideo');cap=capture(v)}
   if(!cap)throw new Error('capture')}
  if(this.out)return this.out
  this.el=v;this.cap=cap;this.out=new MediaStream();this.sync();this.timer=setInterval(()=>this.sync(),500)
  return this.out
 }
 stop(){
  clearInterval(this.timer);this.timer=null
  this.canvas?.stop();this.canvas=null;this.drawing=false
  for(const s of [this.cap,this.sound?.cap])for(const tr of s?.getTracks()||[])try{tr.stop()}catch{}
  try{this.blank?.stop();this.silence?.stop()}catch{}
  this.ctx?.close().catch(()=>{});this.ctx=null
  this.el=null;this.cap=null;this.out=null;this.blank=null;this.silence=null;this.sound=null;this.lastCue=''
  this.onChange=null;this.onCue=null
 }
 /** Send the picture drawn on a canvas instead of the video's own track. */
 redraw(){if(this.drawing||!this.out)return;const v=playerVideo();if(!v||v.readyState<2||!v.videoWidth)return;this.drawing=true;this.sync()}
 // Keeps what is sent in step with the player: checked twice a second.
 private sync(){
  const out=this.out;if(!out)return
  const v=playerVideo()
  if(v!==this.el){this.el=v;this.cap=capture(v)}else if(v&&!this.cap)this.cap=capture(v)
  // When the element loads another video its old tracks end and the new ones join the same stream.
  const picture=(this.drawing?this.drawn():liveTrack(this.cap,'video'))||this.black()
  const sound=this.otherSound()||liveTrack(this.cap,'audio')||this.silent()
  let changed=false
  for(const tr of [picture,sound]){const old=out.getTracks().find(x=>x.kind===tr.kind);if(old===tr)continue;if(old)out.removeTrack(old);out.addTrack(tr);changed=true}
  if(changed)this.onChange?.()
  this.cues(v)
 }
 // The sound is sometimes played by another element than the video (a separate audio
 // track of the source, or the sound converted for a format the player cannot decode).
 private otherSound(){
  const els=Array.from(document.querySelectorAll('.media-player-top audio, audio.audio-fix')).filter(a=>!!((a as HTMLMediaElement).currentSrc||(a as HTMLMediaElement).src)) as HTMLMediaElement[]
  const el=els.find(a=>!a.paused)||els.find(a=>a===this.sound?.el)||null
  if(!el){this.sound=null;return null}
  if(this.sound?.el!==el){const cap=capture(el);this.sound=cap?{el,cap}:null}
  return liveTrack(this.sound?.cap,'audio')
 }
 private black(){
  if(!this.blank||this.blank.readyState!=='live'){const c=document.createElement('canvas');c.width=320;c.height=180;const g=c.getContext('2d')!;g.fillStyle='#000';g.fillRect(0,0,320,180);this.blank=(c as any).captureStream(1).getVideoTracks()[0]}
  return this.blank!
 }
 private silent(){
  if(!this.silence||this.silence.readyState!=='live'){this.ctx=this.ctx||new AudioContext();this.silence=this.ctx.createMediaStreamDestination().stream.getAudioTracks()[0]}
  return this.silence!
 }
 private drawn(){
  if(this.canvas&&this.canvas.track.readyState==='live')return this.canvas.track
  const c=document.createElement('canvas');c.width=640;c.height=360
  const g=c.getContext('2d',{alpha:false})!
  let lastT=-1,lastAt=0
  // Each new picture is drawn (30 a second at most); a still picture is drawn again twice a second.
  const iv=setInterval(()=>{const el=playerVideo();if(!el||!el.videoWidth)return
   const now=performance.now();if(el.currentTime===lastT&&now-lastAt<500)return
   lastT=el.currentTime;lastAt=now
   const k=Math.min(1,1280/el.videoWidth,720/el.videoHeight),w=Math.max(2,Math.round(el.videoWidth*k/2)*2),h=Math.max(2,Math.round(el.videoHeight*k/2)*2)
   if(c.width!==w||c.height!==h){c.width=w;c.height=h}
   try{g.drawImage(el,0,0,w,h)}catch{}},33)
  const track=(c as any).captureStream(30).getVideoTracks()[0] as MediaStreamTrack
  this.canvas={track,stop:()=>{clearInterval(iv);try{track.stop()}catch{}}}
  return track
 }
 private cues(v:HTMLVideoElement|null){
  let text=''
  if(v)for(const tt of Array.from(v.textTracks||[])){
   if(!this.heard.has(tt)){this.heard.add(tt);tt.addEventListener('cuechange',()=>{if(this.out)this.cues(playerVideo())})}
   if(tt.mode!=='showing')continue
   for(const c of Array.from(tt.activeCues||[])){const x=cueText(c);if(x)text+=(text?'\n':'')+x}}
  text=text.slice(0,600)
  if(text!==this.lastCue){this.lastCue=text;this.onCue?.(text)}
 }
}
