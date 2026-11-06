// TV mode and game controllers.
// - TV mode (Settings): bigger interface, full screen, and the arrow keys move
//   between buttons and cards (TV remotes send arrow keys).
// - A game controller works anywhere: D-pad / left stick move, A opens, B goes
//   back, X full screen, Y search everywhere, LB / RB previous / next episode,
//   Start play / pause. While a video is full screen, left / right seek.
import React,{useEffect,useState}from'react'
import{t}from'../i18n'
import{lsGet,lsSet}from'../lib/util'

type Dir='up'|'down'|'left'|'right'
const FOCUSABLE='button:not([disabled]),a[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),video,[tabindex]:not([tabindex="-1"])'
const visible=(el:HTMLElement)=>{const r=el.getBoundingClientRect();if(r.width<2||r.height<2)return false;const st=getComputedStyle(el);return st.visibility!=='hidden'&&st.display!=='none'&&el.closest('[aria-hidden="true"]')===null}
// Root to navigate in: an open dialog first, else the whole page.
const scope=()=>(document.querySelector('.qs, [role="dialog"][aria-modal="true"]') as HTMLElement)||document.body

export function moveFocus(dir:Dir){
 const root=scope(),all=[...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible)
 if(!all.length)return false
 const cur=document.activeElement as HTMLElement|null
 if(!cur||cur===document.body||!root.contains(cur)||!visible(cur)){const first=all.find(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.top<innerHeight})||all[0];document.documentElement.classList.add('kbd-nav');first.focus();return true}
 const a=cur.getBoundingClientRect(),ax=a.left+a.width/2,ay=a.top+a.height/2
 let best:HTMLElement|null=null,bestScore=Infinity
 for(const el of all){if(el===cur||el.contains(cur)||cur.contains(el))continue;const b=el.getBoundingClientRect(),bx=b.left+b.width/2,by=b.top+b.height/2,dx=bx-ax,dy=by-ay
  const ok=dir==='right'?b.left>=a.right-4:dir==='left'?b.right<=a.left+4:dir==='down'?b.top>=a.bottom-4:b.bottom<=a.top+4
  if(!ok)continue
  const main=dir==='left'||dir==='right'?Math.abs(dx):Math.abs(dy),side=dir==='left'||dir==='right'?Math.abs(dy):Math.abs(dx)
  const score=main+side*2.5;if(score<bestScore){bestScore=score;best=el}}
 if(!best)return false
 document.documentElement.classList.add('kbd-nav');best.focus({preventScroll:true});best.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});return true
}
const key=(k:string,extra:Partial<KeyboardEventInit>={})=>{const target=(document.activeElement as HTMLElement)||document.body;target.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true,...extra}))}
const videoFull=()=>document.fullscreenElement instanceof HTMLVideoElement||!!document.fullscreenElement?.querySelector('video')
const anyVideo=()=>document.querySelector('video') as HTMLVideoElement|null
const isField=(el:Element|null)=>!!el&&(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)||(el as HTMLElement).isContentEditable)

export const tvModeOn=()=>lsGet('tvMode')==='1'
export function applyTvMode(on:boolean){document.documentElement.classList.toggle('tv-mode',on);if(on&&!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{});if(!on&&document.fullscreenElement===document.documentElement)document.exitFullscreen().catch(()=>{})}

// Installed once by App.
export function useTvAndGamepad(goBack:()=>void,openSearch:()=>void){
 useEffect(()=>{
  document.documentElement.classList.toggle('tv-mode',tvModeOn())
  // Arrow keys move the focus in TV mode (not while typing, nor on a video / slider).
  const onKey=(e:KeyboardEvent)=>{
   if(!tvModeOn()||e.ctrlKey||e.altKey||e.metaKey)return
   const dir=({ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'} as Record<string,Dir>)[e.key];if(!dir)return
   const el=document.activeElement;if(isField(el)||el instanceof HTMLVideoElement||videoFull())return
   if(moveFocus(dir)){e.preventDefault();e.stopImmediatePropagation()}
  }
  window.addEventListener('keydown',onKey,true)
  const onMouse=()=>document.documentElement.classList.remove('kbd-nav')
  window.addEventListener('mousedown',onMouse,true)
  // Game controllers (polled only while one is connected).
  let raf=0,prev:boolean[]=[],repeatAt:Record<string,number>={}
  const press=(i:number)=>{
   window.dispatchEvent(new Event('nr-user-input')) // a controller press counts as the user acting (watch party)
   const el=document.activeElement as HTMLElement|null
   if(i===0){ // A
    if(el&&el!==document.body&&!(el instanceof HTMLVideoElement)){if(el.tagName==='SELECT'){(el as any).showPicker?.()}else el.click()}
    else{const v=anyVideo();if(v)v.paused?v.play().catch(()=>{}):v.pause()}}
   else if(i===1){ // B
    if(document.fullscreenElement&&document.fullscreenElement!==document.documentElement)document.exitFullscreen().catch(()=>{})
    else if(document.querySelector('.qs'))key('Escape')
    else if(isField(el))(el as HTMLElement).blur()
    else goBack()}
   else if(i===2)key('f') // X: full screen video
   else if(i===3)openSearch() // Y
   else if(i===4)key('p') // LB
   else if(i===5)key('n') // RB
   else if(i===9){const v=anyVideo();if(v)v.paused?v.play().catch(()=>{}):v.pause()} // Start
   else if(i>=12&&i<=15)dpad((['up','down','left','right'] as Dir[])[i-12])
  }
  const dpad=(dir:Dir)=>{if(videoFull()&&(dir==='left'||dir==='right')){const v=anyVideo();if(v)v.currentTime=Math.max(0,Math.min(v.duration||Infinity,v.currentTime+(dir==='right'?10:-10)));return}moveFocus(dir)}
  const poll=()=>{
   const pads=(navigator.getGamepads?.()||[]).filter(Boolean) as Gamepad[]
   const pad=pads[0];if(!pad){raf=0;return}
   const now=performance.now(),btn=pad.buttons.map(b=>b.pressed),ax=pad.axes[0]||0,ay=pad.axes[1]||0
   // Left stick acts as the D-pad.
   const stick:[number,boolean][]=[[12,ay<-.6],[13,ay>.6],[14,ax<-.6],[15,ax>.6]]
   for(const [i,on] of stick)btn[i]=btn[i]||on
   btn.forEach((on,i)=>{const was=prev[i];if(on&&!was){press(i);repeatAt[i]=now+400}else if(on&&i>=12&&i<=15&&now>=(repeatAt[i]||0)){press(i);repeatAt[i]=now+120}})
   prev=btn;raf=requestAnimationFrame(poll)
  }
  const onPad=()=>{if(!raf)raf=requestAnimationFrame(poll)}
  window.addEventListener('gamepadconnected',onPad);onPad()
  return()=>{window.removeEventListener('keydown',onKey,true);window.removeEventListener('mousedown',onMouse,true);window.removeEventListener('gamepadconnected',onPad);cancelAnimationFrame(raf)}
 },[])
}

export function TvSettings(){
 const[on,setOn]=useState(tvModeOn),[pad,setPad]=useState(()=>((navigator.getGamepads?.()||[]).find(Boolean) as Gamepad|undefined)?.id||'')
 useEffect(()=>{const f=(e:any)=>setPad(e.gamepad?.id||'');const g=()=>setPad('');window.addEventListener('gamepadconnected',f);window.addEventListener('gamepaddisconnected',g);return()=>{window.removeEventListener('gamepadconnected',f);window.removeEventListener('gamepaddisconnected',g)}},[])
 return <section className="panel settings-block tv-settings"><h2>{t('TV mode and controller')}</h2>
  <label className="settings-check"><input type="checkbox" checked={on} onChange={e=>{setOn(e.target.checked);lsSet('tvMode',e.target.checked?'1':'0');applyTvMode(e.target.checked)}}/> {t('TV mode: bigger interface, full screen, arrow keys move between buttons (for a TV remote)')}</label>
  <p className="settingsnote">{pad?t('Controller connected: {name}',{name:pad.replace(/\s*\(.*$/,'')}):t('Plug in or pair a game controller (Xbox, PlayStation…) to use it: press any button once.')}</p>
  <div className="tv-keys"><span><b>{t('D-pad / stick')}</b>{t('move')}</span><span><b>A</b>{t('open')}</span><span><b>B</b>{t('back')}</span><span><b>X</b>{t('full screen')}</span><span><b>Y</b>{t('search')}</span><span><b>LB / RB</b>{t('previous / next episode')}</span><span><b>Start</b>{t('play / pause')}</span></div>
 </section>
}
