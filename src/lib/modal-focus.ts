// Windows opened over the page (role="dialog" aria-modal="true": search everywhere,
// Continue, keyboard shortcuts, What's new, the welcome guide, the parent code…).
//  - The keyboard stays inside the window: Tab goes round its buttons instead of
//    wandering to the page behind it.
//  - When it closes, the focus goes back to the button that opened it, instead of
//    being lost at the top of the page (the next Tab then starts from the menu again).
// Installed once (main.tsx); the windows themselves need nothing.
const FOCUSABLE='a[href],button:not(:disabled),input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])'
const MODAL='[aria-modal="true"]'
const shown=(el:HTMLElement)=>{if(el.getClientRects().length===0)return false;const s=getComputedStyle(el);return s.visibility!=='hidden'}
let installed=false
export function installModalFocus(){
 if(installed||typeof document==='undefined'||typeof MutationObserver==='undefined')return
 installed=true
 const stack:{el:HTMLElement,from:HTMLElement|null}[]=[]
 const modalsIn=(n:Node):HTMLElement[]=>{if(!(n instanceof HTMLElement))return[];const out=n.matches(MODAL)?[n]:[];return out.concat(Array.from(n.querySelectorAll<HTMLElement>(MODAL)))}
 // What had the focus when a window took it (the button that opened it): either it still has
 // it when the window appears, or the window already took it and the event says from whom.
 const openers=new WeakMap<HTMLElement,HTMLElement>()
 document.addEventListener('focusin',e=>{const to=e.target as HTMLElement|null,from=e.relatedTarget as HTMLElement|null,box=to?.closest?.(MODAL) as HTMLElement|null
  if(box&&from instanceof HTMLElement&&!box.contains(from)&&!openers.has(box))openers.set(box,from)},true)
 new MutationObserver(list=>{
  for(const m of list){
   m.addedNodes.forEach(n=>{for(const el of modalsIn(n))if(!stack.some(s=>s.el===el)){const a=document.activeElement;stack.push({el,from:a instanceof HTMLElement&&a!==document.body&&!el.contains(a)?a:(openers.get(el)||null)})}})
   m.removedNodes.forEach(n=>{if(!(n instanceof HTMLElement))return
    for(let i=stack.length-1;i>=0;i--){const s=stack[i];if(n!==s.el&&!n.contains(s.el))continue
     stack.splice(i,1)
     // Only when the focus was lost with the window: a page or a field that took it keeps it.
     const a=document.activeElement
     if((!a||a===document.body)&&s.from&&document.contains(s.from)&&shown(s.from))try{s.from.focus({preventScroll:true})}catch{}}})
  }}).observe(document.body,{childList:true,subtree:true})
 document.addEventListener('keydown',e=>{
  if(e.key!=='Tab'||e.altKey||e.ctrlKey||e.metaKey||!stack.length)return
  const box=stack[stack.length-1].el;if(!document.contains(box))return
  const list=Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(shown)
  if(!list.length){e.preventDefault();return}
  const first=list[0],last=list[list.length-1],a=document.activeElement as HTMLElement|null,inside=!!a&&box.contains(a)
  if(e.shiftKey&&(!inside||a===first||a===box)){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&(!inside||a===last)){e.preventDefault();first.focus()}
 },true)
}
