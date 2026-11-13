// The video playing, as the system sees a media player:
//  - PC: the keyboard's media keys (play/pause, next, previous) and the Windows media
//    overlay, through the browser's Media Session;
//  - phone: the controls in the notification shade and on the lock screen, and the
//    buttons of headphones (MediaPlugin.java).
import{useEffect,useRef}from'react'

export type MediaMeta={title:string,artist:string,art?:string}
type Actions={onNext?:()=>void,onPrev?:()=>void}
const native=()=>(window as any).Capacitor?.Plugins?.Media

export function useMediaSession(ref:React.RefObject<HTMLVideoElement|null>,active:boolean,meta:MediaMeta,actions:Actions){
 const act=useRef(actions);act.current=actions
 const info=useRef(meta);info.current=meta
 const hasNext=!!actions.onNext,hasPrev=!!actions.onPrev
 useEffect(()=>{if(!active)return
  const v=ref.current;if(!v)return
  const ms:any=(navigator as any).mediaSession,plugin=native()
  const seek=(d:number)=>{try{v.currentTime=Math.max(0,Math.min((v.duration||1e9)-1,v.currentTime+d))}catch{}}
  const handle=(a:string,pos?:number)=>{
   if(a==='play')v.play().catch(()=>{});else if(a==='pause')v.pause()
   else if(a==='next')act.current.onNext?.();else if(a==='prev')act.current.onPrev?.()
   else if(a==='forward')seek(10);else if(a==='backward')seek(-10)
   else if(a==='seek'&&typeof pos==='number'&&Number.isFinite(pos))v.currentTime=pos}
  // Browser Media Session (the PC, and any browser that has it).
  if(ms){
   try{const M=(window as any).MediaMetadata;if(M)ms.metadata=new M({title:info.current.title,artist:info.current.artist,artwork:info.current.art?[{src:info.current.art,sizes:'512x512'}]:[]})}catch{}
   const set=(name:string,f:any)=>{try{ms.setActionHandler(name,f)}catch{}}
   set('play',()=>handle('play'));set('pause',()=>handle('pause'))
   set('seekbackward',()=>handle('backward'));set('seekforward',()=>handle('forward'))
   set('seekto',(d:any)=>handle('seek',d?.seekTime))
   set('nexttrack',hasNext?()=>handle('next'):null);set('previoustrack',hasPrev?()=>handle('prev'):null)
  }
  // The phone's own media controls.
  let sub:any=null,last=0
  const push=(force=false)=>{if(!plugin?.update)return;const now=Date.now();if(!force&&now-last<5000)return;last=now
   plugin.update({title:info.current.title,artist:info.current.artist,art:info.current.art||'',playing:!v.paused,position:v.currentTime||0,duration:Number.isFinite(v.duration)?v.duration:0,hasNext,hasPrev}).catch(()=>{})}
  if(plugin?.addListener){const r=plugin.addListener('action',(e:any)=>handle(String(e?.action||''),e?.position));Promise.resolve(r).then((h:any)=>{sub=h})}
  const state=()=>{if(ms)try{ms.playbackState=v.paused?'paused':'playing'}catch{};push(true)}
  const tick=()=>{if(ms&&ms.setPositionState&&Number.isFinite(v.duration)&&v.duration>0)try{ms.setPositionState({duration:v.duration,position:Math.min(v.currentTime,v.duration),playbackRate:v.playbackRate||1})}catch{};push()}
  v.addEventListener('play',state);v.addEventListener('pause',state);v.addEventListener('loadedmetadata',state);v.addEventListener('timeupdate',tick)
  if(!v.paused)state()
  return()=>{
   v.removeEventListener('play',state);v.removeEventListener('pause',state);v.removeEventListener('loadedmetadata',state);v.removeEventListener('timeupdate',tick)
   if(ms){for(const n of['play','pause','seekbackward','seekforward','seekto','nexttrack','previoustrack'])try{ms.setActionHandler(n,null)}catch{};try{ms.metadata=null;ms.playbackState='none'}catch{}}
   try{sub?.remove?.()}catch{};plugin?.clear?.().catch?.(()=>{})
  }},[active,meta.title,meta.artist,meta.art,hasNext,hasPrev])
}
