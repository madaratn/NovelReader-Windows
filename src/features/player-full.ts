// Full screen shows the whole player, not the picture alone: "Skip intro", "Next
// episode", the choice of quality, audio and subtitles, the watch party and the
// messages stay within reach. It is the player's section that goes full screen (title,
// "Extracting…", player), so full screen is kept when the stream changes (another
// quality, another server) and from one episode to the next.
// (The video's own full screen button shows the picture only: it is replaced by ours.)
// On Android the system player keeps its own full screen (gestures, picture in picture).
import{useEffect,useState}from'react'

/** What goes full screen for the player `el` belongs to: its section when it has one,
 * else the player itself; null for a player that keeps the system's full screen. */
export const shellOf=(el:Element|null|undefined)=>{const p=(el as any)?.closest?.('.remote-player.shell') as HTMLElement|null;return p?((p.closest('.media-player-top') as HTMLElement|null)||p):null}
/** The player in full screen now, if any. */
export const fullShell=()=>{const f=typeof document!=='undefined'?document.fullscreenElement:null;return f&&(f.classList.contains('media-player-top')||f.classList.contains('remote-player'))?f as HTMLElement:null}
/** Enters or leaves full screen for the player `el` belongs to; false when it has none. */
export function togglePlayerFull(el:Element|null|undefined){
 const shell=shellOf(el);if(!shell)return false
 // In TV mode the whole app is already full screen: the player goes on top of it.
 const cur=document.fullscreenElement
 if(cur&&cur!==document.documentElement)document.exitFullscreen().catch(()=>{})
 else shell.requestFullscreen().catch(()=>{})
 return true}

/** `full`: this player is in full screen. `idle`: nothing moved for 3 s while it plays
 * there, so the bars over the picture and the pointer hide (back at the first move). */
export function usePlayerFull(ref:{current:HTMLElement|null}){
 const[full,setFull]=useState(false),[idle,setIdle]=useState(false)
 useEffect(()=>{const f=()=>{const shell=shellOf(ref.current);setFull(!!shell&&document.fullscreenElement===shell)};f();document.addEventListener('fullscreenchange',f);return()=>document.removeEventListener('fullscreenchange',f)},[])
 useEffect(()=>{if(!full){setIdle(false);return}
  const shell=shellOf(ref.current);if(!shell)return
  let timer=0
  const busy=()=>{const v=shell.querySelector('video') as HTMLVideoElement|null,a=document.activeElement
   return!v||v.paused||!!shell.querySelector('.more-menu.open,.sub-panel,.sub-finder,.cast-panel,.player-next,.anime-toast')||(!!a&&a!==v&&a!==document.body&&!!a.closest('.player-trackbar')&&shell.contains(a)&&a.matches(':focus-visible'))}
  const arm=()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>{if(busy())arm();else setIdle(true)},3000)}
  const wake=()=>{setIdle(false);arm()}
  wake()
  const ev=['mousemove','pointerdown','keydown','touchstart'] as const
  ev.forEach(e=>shell.addEventListener(e,wake,{passive:true}))
  return()=>{window.clearTimeout(timer);ev.forEach(e=>shell.removeEventListener(e,wake))}},[full])
 return{full,idle}}
