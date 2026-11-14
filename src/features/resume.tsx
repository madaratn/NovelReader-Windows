// "Continue where you stopped on the other device": when the last title opened (the
// synced lastPlay, src/lib/history.ts) was opened on another device — the phone when
// this is the PC, or the reverse — a bar offers to continue it here, at the synced
// episode / chapter and position.
import React,{useEffect,useState}from'react'
import{t}from'../i18n'
import{timeAgo}from'../lib/util'
import{deviceTag}from'../lib/history'
import{continueItems,type HomeItem}from'./home'

type LastPlay={kind:string,id:string,name:string,sub:string,at:number,dev:string,on?:'phone'|'pc'}
const read=():LastPlay|null=>{try{const v=JSON.parse(localStorage.getItem('lastPlay')||'null');return v&&v.id&&v.at?v:null}catch{return null}}
const seenAt=()=>Number(localStorage.getItem('resumeSeen'))||0
const MAX_AGE=3*24*3600e3

export function ResumeElsewhere({libs,onResume}:{libs:Record<string,any[]>,onResume:(x:HomeItem)=>void}){
 const[lp,setLp]=useState<LastPlay|null>(read),[,bump]=useState(0)
 useEffect(()=>{const f=()=>setLp(read());const v=()=>{if(document.visibilityState==='visible')f()}
  window.addEventListener('nr-last-play',f);window.addEventListener('nr-media-synced',f);document.addEventListener('visibilitychange',v)
  return()=>{window.removeEventListener('nr-last-play',f);window.removeEventListener('nr-media-synced',f);document.removeEventListener('visibilitychange',v)}},[])
 if(!lp||lp.dev===deviceTag()||lp.at<=seenAt()||Date.now()-lp.at>MAX_AGE)return null
 const x=continueItems(libs as any,60).find(i=>i.kind===lp.kind&&String(i.item?.id||i.item?.url||i.item?.name)===String(lp.id))
 if(!x)return null
 const close=()=>{try{localStorage.setItem('resumeSeen',String(lp.at))}catch{};bump(n=>n+1)}
 const where=lp.on==='phone'?t('on your phone'):t('on your PC')
 return <div className="resume-banner" role="status">
  <span className="resume-icon" aria-hidden="true">{lp.on==='phone'?'📱':'💻'}</span>
  <span className="resume-text"><b>{x.name}</b><small>{t('{what} — opened {where} {ago}',{what:x.sub||lp.sub,where,ago:timeAgo(lp.at)})}</small></span>
  <button className="primary" onClick={()=>{close();onResume(x)}}>{'▶ '+t('Continue here')}</button>
  <button className="resume-close" aria-label={t('Close')} onClick={close}>×</button>
 </div>
}
