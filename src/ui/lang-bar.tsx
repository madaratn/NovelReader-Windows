// Language chips, as in Books › Global search: pick the languages of the sources
// to use. Default = English, multi-language and the app language.
import React,{useState}from'react'
import{t,plural}from'../i18n'
import{lsGet,lsSet}from'../lib/util'
import{preferredLang}from'../features/search'

const LANG_NAMES:Record<string,string>={all:'Multi',en:'English',fr:'Français',es:'Español','es-419':'Español (LatAm)',pt:'Português','pt-br':'Português (BR)',de:'Deutsch',it:'Italiano',ar:'العربية',hi:'हिन्दी',id:'Indonesia',ja:'日本語',ko:'한국어',zh:'中文',ru:'Русский',tr:'Türkçe',vi:'Tiếng Việt',th:'ไทย',pl:'Polski',bn:'বাংলা',ta:'தமிழ்',te:'తెలుగు',ur:'اردو',fa:'فارسی',uk:'Українська',fil:'Filipino'}
export const langName=(l:string)=>LANG_NAMES[String(l).toLowerCase()]||String(l||'?')
export const langOf=(x:any)=>String(x?.lang||'?').toLowerCase()

export function useLangChoice(key:string,items:any[]){
 const[saved,setSaved]=useState<string[]|null>(()=>{try{const x=JSON.parse(lsGet(key)||'null');return Array.isArray(x)?x:null}catch{return null}})
 const counts=new Map<string,number>();for(const x of items){const l=langOf(x);counts.set(l,(counts.get(l)||0)+1)}
 const all=[...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([l])=>l)
 const selected=saved??all.filter(preferredLang)
 const save=(v:string[])=>{setSaved(v);lsSet(key,JSON.stringify(v))}
 return{all,counts,selected,fits:(x:any)=>selected.includes(langOf(x)),toggle:(l:string)=>save(selected.includes(l)?selected.filter(x=>x!==l):[...selected,l]),setAll:(on:boolean)=>save(on?all:all.filter(preferredLang))}
}
export function LangBar({choice,noun}:{choice:ReturnType<typeof useLangChoice>,noun:'search'|'catalog'}){
 const{all,counts,selected,toggle,setAll}=choice
 if(!all.length)return null
 const chip=(l:string)=><button key={l} className={'chip'+(selected.includes(l)?' on':'')} aria-pressed={selected.includes(l)} onClick={()=>toggle(l)} title={l}>{langName(l)} <small>{counts.get(l)}</small></button>
 const n=all.filter(l=>selected.includes(l)).reduce((a,l)=>a+(counts.get(l)||0),0)
 return <div className="langbar"><span>{t('Languages')}</span>
  {all.slice(0,10).map(chip)}
  {all.length>10&&<details className="morelangs"><summary className="chip">{t('+{n} more',{n:all.length-10})}</summary><div>{all.slice(10).map(chip)}</div></details>}
  <button className="chip ghost" onClick={()=>setAll(selected.length<all.length)}>{selected.length>=all.length?t('Default languages'):t('All languages')}</button>
  <small className="langcount">{noun==='search'?plural(n,'{n} source selected','{n} sources selected'):plural(n,'{n} source shown','{n} sources shown')}</small>
 </div>
}
