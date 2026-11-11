import React,{useEffect,useState}from'react'
// Touch gestures on the video (phones and tablets): two quick taps on the left or
// right third go back / forward 10 seconds. In full screen the system player has
// its own double tap, and the app adds volume and brightness slides (MainActivity).
export const SEEK_STEP=10
// Which side a tap is on, or '' (middle, or the bottom strip with the seek bar).
export function tapSide(x:number,y:number,w:number,h:number):''|'back'|'forward'{
 if(w<=0||h<=0||y>h*0.8)return''
 return x<w*0.35?'back':x>w*0.65?'forward':''}
export function useDoubleTapSeek(ref:React.RefObject<HTMLVideoElement>,dep?:any){
 const[flash,setFlash]=useState<{side:string,n:number}|null>(null)
 useEffect(()=>{const el=ref.current;if(!el)return
  let last={t:0,side:''},timer=0
  const onEnd=(e:TouchEvent)=>{
   if(document.fullscreenElement||e.changedTouches.length!==1)return
   const r=el.getBoundingClientRect(),p=e.changedTouches[0],side=tapSide(p.clientX-r.left,p.clientY-r.top,r.width,r.height),now=Date.now()
   if(side&&last.side===side&&now-last.t<320){
    last={t:0,side:''};e.preventDefault()
    const d=Number.isFinite(el.duration)?el.duration:Infinity
    el.currentTime=Math.max(0,Math.min(d-0.5,el.currentTime+(side==='back'?-SEEK_STEP:SEEK_STEP)))
    setFlash(f=>({side,n:(f?.n||0)+1}));window.clearTimeout(timer);timer=window.setTimeout(()=>setFlash(null),650)
   }else last={t:now,side}}
  el.addEventListener('touchend',onEnd,{passive:false})
  return()=>{el.removeEventListener('touchend',onEnd);window.clearTimeout(timer)}},[dep])
 return flash?<div className={'seek-flash '+flash.side} key={flash.n} aria-live="polite">{flash.side==='back'?'« '+SEEK_STEP+' s':SEEK_STEP+' s »'}</div>:null}
// Android: the small floating window is the system's (the video goes full screen first).
export const nativePlayer=():any=>(window as any).Capacitor?.Plugins?.Player
export async function androidMiniPlayer(el:HTMLVideoElement|null){
 const P=nativePlayer();if(!P||!el)return false
 if(!document.fullscreenElement)await el.requestFullscreen()
 for(let i=0;i<10;i++){await new Promise(r=>setTimeout(r,150));try{if((await P.enterPip())?.ok)return true}catch{}}
 return false}
