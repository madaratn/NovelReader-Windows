// "Tunisian TV": the series and telefilms that Tunisian channels publish on their
// official YouTube channels, as a video source of the app (served here, not by the
// engine: see src/lib/engine.ts). Series = the channels' playlists, episodes = the
// videos; they play in YouTube's own player (embedded). The list comes from a catalog
// rebuilt twice a week from the channels' public pages (scripts/tntv-catalog.py,
// workflow "Tunisian TV catalog"): no key, no account.
export const TNTV_ID='777000000000000216'
export const TNTV_NAME='Tunisian TV (YouTube)'
import{t}from'../i18n'
export const TNTV_CATALOG='https://raw.githubusercontent.com/madaratn/NovelReader-Windows/catalog/tntv/'
export const TNTV_CHANNELS=['Télévision Tunisienne','Elhiwar Ettounsi','Attessia TV','Carthage Plus TV','Nessma TV','Tunisna TV']
const PAGE=30

const ls={get:(k:string)=>{try{return localStorage.getItem(k)}catch{return null}},set:(k:string,v:string)=>{try{localStorage.setItem(k,v)}catch{}}}
export const tntvEnabled=()=>ls.get('tntvEnabled')==='1'
export function setTntv(on:boolean){ls.set('tntvEnabled',on?'1':'0')
 // Arabic among the chosen languages, where a choice was saved (otherwise the source would stay hidden).
 if(on)for(const k of ['mediaLangs:Series','mediaLangs:Movie','videoCatalogLangs']){try{const v=JSON.parse(ls.get(k)||'null');if(Array.isArray(v)&&!v.includes('ar'))ls.set(k,JSON.stringify([...v,'ar']))}catch{}}
 window.dispatchEvent(new Event('nr-sources-changed'))}

export type Playlist={id:string,title:string,thumb:string,channel:string,count:number}
type Catalog={at:string,channels:{id:string,name:string,file:string}[],playlists:Playlist[]}
// Kept 12 hours; an older copy still answers when offline or when the download fails.
// Only the list of series is saved (the files of the channels are large: memory only).
const mem=new Map<string,any>()
async function cached(file:string):Promise<any>{
 const k='tntv:'+file;let old:any=mem.get(k)||null
 if(!old)try{old=JSON.parse(ls.get(k)||'null')}catch{}
 if(old&&Date.now()-old.at<12*3600_000){mem.set(k,old);return old.data}
 try{const r=await fetch(TNTV_CATALOG+file);if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json(),rec={at:Date.now(),data};mem.set(k,rec);if(file==='tntv-catalog.json')ls.set(k,JSON.stringify(rec));return data}
 catch(e){if(old)return old.data;throw Error(t('The list of Tunisian series could not be downloaded. Check the connection and try again.'))}}
async function catalog():Promise<Catalog>{const c=await cached('tntv-catalog.json');if(!c||!Array.isArray(c.playlists))throw Error(t('The list of Tunisian series could not be downloaded. Check the connection and try again.'));return c}
const playlists=async()=>(await catalog()).playlists
// The videos of a series: in the file of its channel.
async function videosOf(id:string):Promise<[string,string][]>{
 const c=await catalog(),p=c.playlists.find(x=>x.id===id),ch=p&&c.channels.find(x=>x.name===p.channel)
 if(!ch)return[]
 return((await cached(ch.file))?.playlists||{})[id]||[]}

// Arabic and Latin spellings compared loosely (diacritics, alef / ya / ta marbuta forms).
export const norm=(s:string)=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ـ/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
export function matches(title:string,query:string){const t=norm(title),words=norm(query).split(' ').filter(Boolean);return words.length>0&&words.every(w=>t.includes(w))}

const page=(list:Playlist[],p:number)=>({animes:list.slice((p-1)*PAGE,p*PAGE).map(x=>({url:'pl:'+x.id,title:x.title,thumbnail_url:x.thumb,description:x.channel+' · '+x.count+' videos'})),hasNextPage:list.length>p*PAGE})
export const episodeNumber=(title:string,i:number)=>{const m=/(?:الحلقة|حلقة|episode|ép(?:isode)?|ep\.?)\s*(\d{1,4})/i.exec(title)||/(?:^|\D)(\d{1,3})\s*$/.exec(title.trim());return m?Number(m[1]):i+1}

/** Answers the engine's API paths for this source. */
export async function tntvFetch(path:string):Promise<any>{
 const u=new URL('http://x'+path),kind=u.pathname.split('/').pop()||'',p=Math.max(1,Number(u.searchParams.get('page'))||1),url=u.searchParams.get('url')||''
 if(kind==='popular')return page((await playlists()).slice().sort((a,b)=>b.count-a.count),p)
 if(kind==='latest')return page(await playlists(),p)
 if(kind==='search'){const q=u.searchParams.get('query')||u.searchParams.get('q')||'';return page((await playlists()).filter(x=>matches(x.title,q)),p)}
 if(kind==='details'){const id=url.replace(/^pl:/,''),x=(await playlists()).find(y=>y.id===id);return{url,title:x?.title||'',description:x?x.channel+' · '+x.count+' videos':'',thumbnail_url:x?.thumb||'',author:x?.channel||'',genre:'Tunisie',status:0}}
 if(kind==='episodes'){const list=await videosOf(url.replace(/^pl:/,''));return{episodes:list.map(([vid,name],i)=>({url:'yt:'+vid,name,date_upload:0,episode_number:episodeNumber(name,i)}))}}
 if(kind==='videos'){const id=url.replace(/^yt:/,'');return{videos:[{videoUrl:'https://www.youtube.com/watch?v='+id,videoTitle:'YouTube',headers:{},subtitleTracks:[],audioTracks:[]}]}}
 if(kind==='hosters')return{hosters:[]}
 if(kind==='seasons')return[]
 throw Error('Not supported by '+TNTV_NAME)
}
