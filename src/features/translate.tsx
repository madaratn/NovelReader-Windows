// Translate a chapter: every paragraph is translated (keeping italics and the
// layout) and shown in place of the original; one click switches back.
import React,{useEffect,useState}from'react'
import{t,getLang}from'../i18n'
import{lsGet,lsSet}from'../lib/util'

export const TRANSLATE_LANGS:[string,string][]=[['fr','Français'],['en','English'],['es','Español'],['de','Deutsch'],['it','Italiano'],['pt','Português'],['ar','العربية'],['ja','日本語'],['ko','한국어'],['zh-CN','中文'],['ru','Русский'],['tr','Türkçe']]
export const translateTarget=()=>lsGet('translateTo')||getLang()
const autoMap=():Record<string,string>=>{try{return JSON.parse(lsGet('translateNovels')||'{}')||{}}catch{return{}}}
export const autoTranslateFor=(novelId:string)=>autoMap()[novelId]||''
export const setAutoTranslate=(novelId:string,lang:string)=>{const m=autoMap();if(lang)m[novelId]=lang;else delete m[novelId];lsSet('translateNovels',JSON.stringify(m))}

const BLOCKS='h1,h2,h3,h4,h5,p,li,blockquote,td,figcaption,div'
// Translate the safe chapter HTML; returns new HTML with the same structure.
export async function translateChapterHtml(html:string,to:string){
 const doc=new DOMParser().parseFromString('<body>'+html+'</body>','text/html')
 let blocks=[...doc.body.querySelectorAll<HTMLElement>(BLOCKS)].filter(e=>!e.querySelector(BLOCKS)&&(e.textContent||'').trim())
 if(!blocks.length){ // plain text chapter: one paragraph per line
  const lines=(doc.body.textContent||'').split(/\n+/).map(x=>x.trim()).filter(Boolean)
  doc.body.innerHTML='';for(const l of lines){const p=doc.createElement('p');p.textContent=l;doc.body.appendChild(p)}
  blocks=[...doc.body.querySelectorAll<HTMLElement>('p')]
 }
 const out=await window.novelReader.translate!({texts:blocks.map(b=>b.innerHTML),to})
 blocks.forEach((b,i)=>{b.innerHTML=out[i]??b.innerHTML})
 return doc.body.innerHTML
}

// Toolbar button + small menu (target language, always translate this novel).
export function TranslateControl({active,busy,onTranslate,onOriginal,novelId}:{active:boolean,busy:boolean,onTranslate:(lang:string)=>void,onOriginal:()=>void,novelId:string}){
 const[open,setOpen]=useState(false),[lang,setLang]=useState(translateTarget),[auto,setAuto]=useState(()=>!!autoTranslateFor(novelId))
 useEffect(()=>{setAuto(!!autoTranslateFor(novelId))},[novelId])
 if(!window.novelReader.translate)return null
 return <span className="translate-ctl">
  <button className={'themebtn translate-toggle'+(active?' on':'')} aria-pressed={active} disabled={busy} title={active?t('Show the original'):t('Translate this chapter')} aria-label={active?t('Show the original'):t('Translate this chapter')} onClick={()=>active?onOriginal():onTranslate(lang)}>{busy?'…':'文A'}</button>
  <button className="themebtn translate-more" aria-expanded={open} aria-label={t('Translation settings')} title={t('Translation settings')} onClick={()=>setOpen(o=>!o)}>▾</button>
  {open&&<div className="translate-menu" role="dialog" aria-label={t('Translation settings')}>
   <label>{t('Translate into')}<select value={lang} onChange={e=>{setLang(e.target.value);lsSet('translateTo',e.target.value);if(auto)setAutoTranslate(novelId,e.target.value);if(active)onTranslate(e.target.value)}}>{TRANSLATE_LANGS.map(([c,n])=><option key={c} value={c}>{n}</option>)}</select></label>
   <label className="tts-check"><input type="checkbox" checked={auto} onChange={e=>{setAuto(e.target.checked);setAutoTranslate(novelId,e.target.checked?lang:'');if(e.target.checked&&!active)onTranslate(lang)}}/> {t('Always translate this novel')}</label>
   <small>{t('Machine translation by Google Translate. Bookmarks and highlights stay on the original text.')}</small>
  </div>}
 </span>
}
