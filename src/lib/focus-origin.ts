// How the element that has the focus got it: by a click or a touch, or with the keyboard.
// A button keeps the focus after a click (an episode card, "Next episode", a button of the
// party panel…), and Space presses the focused button: pressing Space to pause loaded the
// episode again, or went on to the next one. The player's keys are taken by the player on
// a control that only kept the focus after a click; a control reached with the keyboard
// (Tab) keeps its keys (Space presses a button, arrows move in a list), as it should.
let pointerAt=0,byPointer:EventTarget|null=null
if(typeof window!=='undefined'){
 window.addEventListener('pointerdown',()=>{pointerAt=Date.now()},true)
 window.addEventListener('focusin',e=>{byPointer=Date.now()-pointerAt<1500?e.target:null},true)
 // Tab: what gets the focus next is reached with the keyboard.
 window.addEventListener('keydown',e=>{if(e.key==='Tab')pointerAt=0},true)
}
const kind=(el:EventTarget|null)=>{const x=el as HTMLElement|null;return x&&typeof x.tagName==='string'?x:null}
/** The focus came with a click or a touch (not with the keyboard). */
export const focusedByPointer=(el:EventTarget|null)=>!!el&&el===byPointer&&el===document.activeElement
/** A field where keys type: every key belongs to it. (Ticks, sliders, lists and buttons are not fields.) */
export const typingIn=(el:EventTarget|null)=>{const x=kind(el);if(!x)return false
 if(x.isContentEditable||x.tagName==='TEXTAREA')return true
 return x.tagName==='INPUT'&&!/^(checkbox|radio|range|button|submit|reset|color|file|image)$/i.test((x as HTMLInputElement).type)}
const SPACE_ROLES=/^(button|checkbox|radio|switch|menuitem|menuitemcheckbox|menuitemradio|tab|option)$/
const ARROW_ROLES=/^(radio|radiogroup|tab|tablist|option|listbox|menu|menuitem|menubar|tree|treeitem|grid)$/
/** Does the player take this key (Space, an arrow, a letter), or does it belong to the focused element? */
export function playerTakes(el:EventTarget|null,key:string){
 const x=kind(el);if(!x||x===document.body||x===document.documentElement)return true
 if(typingIn(x))return false
 const tag=x.tagName,type=tag==='INPUT'?(x as HTMLInputElement).type.toLowerCase():'',role=x.getAttribute('role')||''
 // A slider always moves with the arrows (volume, position), however it got the focus.
 if((key==='ArrowLeft'||key==='ArrowRight')&&(type==='range'||role==='slider'||role==='spinbutton'))return false
 // Reached with the keyboard, or in a window that must be answered first (a confirmation…): its keys.
 const keyboard=!focusedByPointer(x)||!!x.closest('[aria-modal="true"],.qs')
 if(!keyboard)return true
 if(key===' ')return!(tag==='BUTTON'||tag==='SUMMARY'||tag==='SELECT'||/^(checkbox|radio|button|submit|reset|color|file|image)$/.test(type)||SPACE_ROLES.test(role))
 if(key==='ArrowLeft'||key==='ArrowRight')return!(tag==='SELECT'||type==='radio'||ARROW_ROLES.test(role))
 // A list reached with the keyboard picks an option by its first letter.
 return tag!=='SELECT'
}
