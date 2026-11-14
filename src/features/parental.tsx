// Kids profile and parent code, on the page side (the code itself is checked by
// electron/profiles.cjs on the PC and src/platform/android-profiles.ts on the phone).
//  - In a kids profile, Settings and the Sources pages ask for the parent code, and so
//    does leaving the profile; titles with adult genres (or outside the genres the
//    parent chose) do not open.
//  - The code typed once stays valid 10 minutes, in memory only.
import React,{useEffect,useRef,useState}from'react'
import{t}from'../i18n'
import{kidsVerdict}from'../lib/parental'

const nr=()=>window.novelReader as any
type State={kids:boolean,genres:string[],pin:boolean,name:string}
let state:State={kids:false,genres:[],pin:false,name:''}
let unlockedPin='',unlockedUntil=0
const subs=new Set<()=>void>()
const emit=()=>subs.forEach(f=>f())
export async function loadParental(){
 try{if(typeof nr()?.profileList!=='function')return state
  const d=await nr().profileList(),cur=(d.list||[]).find((p:any)=>p.id===d.current)
  state={kids:!!(cur?.kids&&d.pin),genres:Array.isArray(cur?.genres)?cur.genres:[],pin:!!d.pin,name:String(cur?.name||'')}
  document.documentElement.classList.toggle('kids',state.kids);emit()}catch{}
 return state}
export const parental=()=>state
export const unlocked=()=>!!unlockedPin&&Date.now()<unlockedUntil
export const knownPin=()=>unlocked()?unlockedPin:''
const remember=(pin:string)=>{unlockedPin=pin;unlockedUntil=Date.now()+10*60e3;emit()}
export const lockAgain=()=>{unlockedPin='';unlockedUntil=0;emit()}

export function useParental(){
 const[,bump]=useState(0)
 useEffect(()=>{const f=()=>bump(x=>x+1);subs.add(f);loadParental();const r=()=>loadParental();window.addEventListener('nr-profiles',r);const tm=setInterval(f,30000);return()=>{subs.delete(f);window.removeEventListener('nr-profiles',r);clearInterval(tm)}},[])
 return{...state,unlocked:unlocked()}
}

// Can this title be opened in the current profile? -> '' or the reason to show.
export function kidsBlock(...withGenres:any[]):string{
 if(!state.kids)return ''
 const genres=withGenres.map(x=>x?.genres||x?.genre).find(g=>Array.isArray(g)?g.length:g)
 const v=kidsVerdict(genres,state.genres)
 return v.ok?'':v.reason==='adult'?t('This title is not for children. Ask a parent to open it from another profile.'):t('This title is outside the genres allowed for this profile.')
}

// ---- Asking for the code -----------------------------------------------------------
let asker:((why:string)=>Promise<string|null>)|null=null
// Resolves with the right code, or null when cancelled. Without a parent code: ''.
export async function requestPin(why=''):Promise<string|null>{
 if(!state.pin){await loadParental();if(!state.pin)return ''}
 if(unlocked())return unlockedPin
 return asker?asker(why):null
}

export function PinHost(){
 const[ask,setAsk]=useState<{why:string,done:(v:string|null)=>void}|null>(null)
 useEffect(()=>{asker=why=>new Promise(res=>setAsk({why,done:v=>{setAsk(null);res(v)}}));return()=>{asker=null}},[])
 if(!ask)return null
 return <div className="pin-backdrop" role="dialog" aria-modal="true" aria-label={t('Parent code')} onMouseDown={e=>{if(e.target===e.currentTarget)ask.done(null)}}>
  <div className="pin-dialog"><PinForm why={ask.why} onOk={pin=>ask.done(pin)} onCancel={()=>ask.done(null)}/></div></div>
}

export function PinForm({why,onOk,onCancel}:{why?:string,onOk:(pin:string)=>void,onCancel?:()=>void}){
 const[pin,setPin]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),ref=useRef<HTMLInputElement>(null)
 useEffect(()=>{ref.current?.focus()},[])
 const go=async()=>{if(!pin)return;setBusy(true);setMsg('');try{if(await nr().profileCheckPin(pin)){remember(pin);onOk(pin)}else{setMsg(t('Wrong code.'));setPin('')}}catch(e:any){setMsg(t(String(e?.message||e)))}finally{setBusy(false)}}
 return <form className="pin-form" onSubmit={e=>{e.preventDefault();go()}}>
  <h2>🔒 {t('Parent code')}</h2>
  <p>{why||t('Type the parent code to continue.')}</p>
  <input ref={ref} type="password" inputMode="numeric" autoComplete="off" maxLength={8} aria-label={t('Parent code')} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}/>
  {msg&&<small role="alert">{msg}</small>}
  <div className="pin-actions">{onCancel&&<button type="button" onClick={onCancel}>{t('Cancel')}</button>}<button className="primary" type="submit" disabled={busy||pin.length<4}>{t('Unlock')}</button></div>
 </form>
}

// In place of a page a child should not change.
export function PinGate({onBack}:{onBack:()=>void}){
 return <div className="pin-gate panel"><PinForm why={t('This page is for parents. Type the parent code to open it.')} onOk={()=>{}} onCancel={onBack}/></div>
}
