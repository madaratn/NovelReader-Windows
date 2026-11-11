// Television (Android TV / Google TV): the remote's arrows move the focus from one
// control to the nearest one in that direction, OK presses it, and the focused control
// is clearly outlined. Also: what the Back button does on every Android device.
const FOCUSABLE='button:not([disabled]),a[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),video[controls],iframe'
type Dir='up'|'down'|'left'|'right'
const visible=(e:Element)=>{const r=e.getBoundingClientRect();if(r.width<2||r.height<2)return false;const s=getComputedStyle(e);return s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)>0.05}
// Where the arrows may go: inside the open dialog / sheet when there is one.
export function scope(doc:Document=document):Element{
 const open=Array.from(doc.querySelectorAll('[role="dialog"],.m-sheet')).filter(visible);return open.length?open[open.length-1]:doc.body}
/** The control nearest to [from] in a direction (centre to centre, straight ahead preferred), or null. */
export function nextFocus(from:Element|null,dir:Dir,root:Element=scope()):HTMLElement|null{
 const all=(Array.from(root.querySelectorAll(FOCUSABLE)) as HTMLElement[]).filter(e=>e!==from&&visible(e))
 if(!from||from===document.body||!root.contains(from))return all[0]||null
 const a=from.getBoundingClientRect(),ax=a.left+a.width/2,ay=a.top+a.height/2
 let best:HTMLElement|null=null,bestScore=Infinity
 for(const e of all){const b=e.getBoundingClientRect(),bx=b.left+b.width/2,by=b.top+b.height/2,dx=bx-ax,dy=by-ay
  // In the asked direction: past the edge of the current control, not merely off-centre.
  const ahead=dir==='left'?a.left-b.right:dir==='right'?b.left-a.right:dir==='up'?a.top-b.bottom:b.top-a.bottom
  if(ahead<-1)continue
  const main=dir==='left'||dir==='right'?Math.abs(dx):Math.abs(dy),side=dir==='left'||dir==='right'?Math.abs(dy):Math.abs(dx)
  // Overlap on the other axis counts as "straight ahead".
  const overlap=dir==='left'||dir==='right'?Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top):Math.min(a.right,b.right)-Math.max(a.left,b.left)
  const score=main+(overlap>0?0:side*3)+side*0.3
  if(score<bestScore){bestScore=score;best=e}}
 return best}
const KEYS:Record<string,Dir>={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}
export function tvKey(e:KeyboardEvent){
 const dir=KEYS[e.key];if(!dir||e.ctrlKey||e.altKey||e.metaKey)return
 const el=document.activeElement as HTMLElement|null,tag=el?.tagName
 // Reading a chapter: the arrows keep their reading role (scroll, previous / next chapter).
 if(document.querySelector('.readerpage')&&scope()===document.body)return
 // Text fields keep left / right (the cursor); a list keeps up / down; a video keeps left / right (seek).
 if((tag==='INPUT'||tag==='TEXTAREA')&&(dir==='left'||dir==='right')&&!/^(checkbox|radio|range|button|submit)$/.test((el as HTMLInputElement).type||''))return
 if(tag==='VIDEO'&&(dir==='left'||dir==='right')){const v=el as HTMLVideoElement;e.preventDefault();v.currentTime=Math.max(0,Math.min((Number.isFinite(v.duration)?v.duration:Infinity)-0.5,v.currentTime+(dir==='left'?-10:10)));return}
 if(tag==='SELECT'&&(dir==='up'||dir==='down'))return
 const next=nextFocus(el,dir);if(!next)return
 e.preventDefault();next.focus({preventScroll:true});next.scrollIntoView({block:'nearest',inline:'nearest'})}
export function enableTv(){
 const root=document.documentElement;if(root.classList.contains('tv'))return
 root.classList.add('tv')
 document.addEventListener('keydown',tvKey,true)
 // OK on a video: play / pause. Always something focused, so the first arrow press does something.
 document.addEventListener('keydown',e=>{const v=document.activeElement as any;if(e.key==='Enter'&&v?.tagName==='VIDEO'){e.preventDefault();v.paused?v.play():v.pause()}},true)
 const first=()=>{if(!document.activeElement||document.activeElement===document.body)nextFocus(null,'down')?.focus({preventScroll:true})}
 setTimeout(first,800);new MutationObserver(()=>{if(document.activeElement===document.body||!document.contains(document.activeElement))setTimeout(first,50)}).observe(document.body,{childList:true,subtree:true})}
/** Back: leave full screen, close what is open, go back one screen; false when there is nothing to go back to. */
export function handleBack(goBack:()=>boolean):boolean{
 if(document.fullscreenElement){document.exitFullscreen().catch(()=>{});return true}
 const s=scope();if(s!==document.body){
  // Dialogs close on Escape or on their close button / backdrop.
  const close=s.querySelector('[aria-label="Close"],.iconbtn[aria-label]') as HTMLElement|null
  s.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))
  if(document.contains(s)&&visible(s)){if(close)close.click();else(s.parentElement as HTMLElement|null)?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))}
  return true}
 return goBack()}
