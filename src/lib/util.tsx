import React,{useEffect,useRef,useState}from'react'
import{t,plural,getLang}from'../i18n'

// ---- Local videos -------------------------------------------------------
export const fmtSize=(n:number)=>n>1e9?(n/1e9).toFixed(1)+' GB':(n/1e6).toFixed(0)+' MB'
export const fmtTime=(t:number)=>{t=Math.floor(t);const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return(h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(s).padStart(2,'0')}

// ---- Internet Archive (torrent streaming) -------------------------------
// Public-domain / Creative Commons videos from archive.org, streamed from the
// item's official torrent by the Electron main process.
export const fmtMB=(n:number)=>(n/1048576).toFixed(n<10485760?1:0)+' MB'
export const lsGet=(k:string)=>{try{return localStorage.getItem(k)}catch{return null}}
export const lsSet=(k:string,v:string)=>{try{localStorage.setItem(k,v)}catch{}}
try{if(localStorage.getItem('lastPage:books')==='comics')localStorage.setItem('lastPage:books','search')}catch{}
export const isTyping=(t:EventTarget|null)=>{const el=t as HTMLElement|null;return !!el&&(el.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(el.tagName))}
export function focusPageSearch(){const el=document.querySelector<HTMLInputElement>('main .searchbar input, main input[type=search]');if(el){el.focus();el.select()}return !!el}
export const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v))
export function timeAgo(at?:number){if(!at)return '';const s=Math.max(0,(Date.now()-at)/1000);if(s<60)return t('just now');const m=s/60;if(m<60)return t('{n} min ago',{n:Math.floor(m)});const h=m/60;if(h<24)return t('{n} h ago',{n:Math.floor(h)});const d=Math.floor(h/24);if(d<7)return plural(d,'{n} day ago','{n} days ago');return new Date(at).toLocaleDateString(getLang())}
export function initials(name:string){return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?'}
export function hueOf(name:string){let h=0;for(const ch of String(name))h=(h*31+ch.charCodeAt(0))%360;return h}
export const fmtDateTime=(ms:number)=>ms?new Date(ms).toLocaleString(getLang(),{dateStyle:'medium',timeStyle:'short'}):''
